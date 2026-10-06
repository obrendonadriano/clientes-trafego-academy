import { after } from "next/server";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sealSecret, isSecretBoxConfigured } from "@/lib/meta/secret-box";
import {
  MetaOnboardingError,
  runOnboarding,
} from "@/lib/meta/whatsapp-onboarding";
import {
  OnboardingRejected,
  SIGNUP_EVENTS,
  type SignupEvent,
} from "@/lib/meta/onboarding-selection";
import { redactSecrets } from "@/lib/meta/onboarding-diagnostics";
import {
  isConnected,
  type ConnectionStatus,
} from "@/lib/conversions/connection-shared";
import { dispatchQuietly } from "@/lib/conversions/dispatcher";

// Conclui o Embedded Signup. O navegador entrega apenas o código de autorização
// e os identificadores que a Meta devolveu no popup oficial; a troca por token,
// a conferência do WABA/número, a assinatura do webhook, a resolução do Dataset
// e as sincronizações do aplicativo WhatsApp Business acontecem todas aqui.
// Nenhum segredo volta na resposta nem vai para log.
//
// A elegibilidade do número é decidida pela Meta dentro do popup. Quando ela
// não libera um número, nada é conectado: o cliente recebe uma explicação e
// pode tentar de novo mais tarde.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^\d{5,30}$/;

type PreviousConnection = {
  status: ConnectionStatus | null;
  phone_number_id: string | null;
  // Coluna da migração 20261006120000; ausente enquanto ela não for aplicada.
  business_app_synced_at?: string | null;
};

export async function POST(request: Request) {
  const user = await getOptionalCurrentUser();

  // O cliente conecta o próprio WhatsApp. O client_id vem da sessão, nunca do
  // corpo da requisição.
  if (!user?.active || user.role !== "client" || !user.clientId) {
    return Response.json(
      { error: "Entre no portal com o seu usuário para conectar o WhatsApp." },
      { status: 401 },
    );
  }

  const clientId = user.clientId;

  if (!isSecretBoxConfigured()) {
    return Response.json(
      {
        error:
          "A conexão com a Meta ainda não foi liberada pelo administrador. Tente novamente mais tarde.",
      },
      { status: 503 },
    );
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return Response.json(
      { error: "Serviço indisponível no momento." },
      { status: 503 },
    );
  }

  let body: {
    code?: unknown;
    wabaId?: unknown;
    phoneNumberId?: unknown;
    event?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const wabaId =
    typeof body.wabaId === "string" && ID.test(body.wabaId.trim())
      ? body.wabaId.trim()
      : null;
  const phoneNumberId =
    typeof body.phoneNumberId === "string" && ID.test(body.phoneNumberId.trim())
      ? body.phoneNumberId.trim()
      : null;
  const event = SIGNUP_EVENTS.includes(body.event as SignupEvent)
    ? (body.event as SignupEvent)
    : null;

  if (!code || code.length > 2000) {
    return Response.json(
      { error: "Autorização da Meta ausente. Refaça a conexão." },
      { status: 400 },
    );
  }

  // Estado atual: uma nova tentativa que falha não pode derrubar uma conexão
  // que já estava funcionando.
  const { data: previousRow } = await admin
    .from("client_whatsapp_connections")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle<PreviousConnection>();
  const previous = previousRow ?? null;
  const wasConnected = previous?.status ? isConnected(previous.status) : false;

  async function setStatus(status: ConnectionStatus, lastError: string | null) {
    // Conectado antes: mantém o status e só registra o motivo da falha.
    const keep = wasConnected && previous?.status ? previous.status : status;
    await admin!.rpc("meta_set_connection_status", {
      p_client_id: clientId,
      p_status: keep,
      p_last_error: lastError ? redactSecrets(lastError).slice(0, 1000) : null,
    });
  }

  if (!wasConnected) {
    await setStatus("onboarding", null);
  }

  try {
    const result = await runOnboarding({
      code,
      wabaId,
      phoneNumberId,
      event,
      previous: previous
        ? {
            phoneNumberId: previous.phone_number_id,
            businessAppSyncedAt: previous.business_app_synced_at ?? null,
          }
        : null,
    });

    const { error } = await admin.rpc("meta_save_whatsapp_connection", {
      p_client_id: clientId,
      p_waba_id: result.wabaId,
      p_phone_number_id: result.phoneNumberId,
      p_display_phone_number: result.displayPhoneNumber,
      p_verified_name: result.verifiedName,
      p_business_id: result.businessId,
      p_dataset_id: result.datasetId,
      p_is_on_biz_app: result.isOnBizApp,
      p_platform_type: result.platformType,
      p_webhook_subscribed: result.webhookSubscribed,
      p_status: result.status,
      // O token entra cifrado; o schema privado é a segunda barreira.
      p_access_token: sealSecret(result.accessToken),
      p_token_scopes: result.scopes.join(","),
      p_last_error: result.lastError ? redactSecrets(result.lastError) : null,
    });

    if (error) {
      // Conflito de WABA/número já vinculado a outro cliente: recusar é o
      // comportamento correto, senão os leads iriam para o tenant errado.
      const duplicate = error.code === "23505";
      console.error("[meta/onboarding] save_connection_failed", {
        stage: "save_connection",
        dbCode: error.code ?? null,
        duplicate,
      });
      await setStatus(
        "attention_required",
        duplicate
          ? "WABA ou número já vinculado a outro cliente."
          : "Falha ao salvar a conexão no banco.",
      );

      return Response.json(
        {
          error: duplicate
            ? "Este WhatsApp já está conectado a outra conta. Fale com o seu gestor."
            : "Não foi possível salvar a conexão. Tente novamente.",
        },
        { status: duplicate ? 409 : 500 },
      );
    }

    if (result.businessApp.contactsSyncRequested || result.businessApp.historySyncRequested) {
      // Só um registro: a sincronização do aplicativo é de uma vez só. Sem a
      // migração aplicada a chamada falha e a conexão segue válida.
      const { error: syncError } = await admin.rpc("meta_record_business_app_sync", {
        p_client_id: clientId,
        p_contacts_requested: result.businessApp.contactsSyncRequested,
        p_history_requested: result.businessApp.historySyncRequested,
      });

      if (syncError) {
        console.warn("[meta/onboarding] record_business_app_sync_failed", {
          dbCode: syncError.code ?? null,
        });
      }
    }

    if (result.status === "active") {
      after(() => dispatchQuietly());
    }

    return Response.json({
      status: result.status,
      connected: true,
      phone: result.displayPhoneNumber,
      trackingReady: result.status === "active",
      needsAttention: result.status === "attention_required",
    });
  } catch (error) {
    // Número inelegível ou não compartilhado não é falha do sistema: é a Meta
    // dizendo que aquele número ainda não pode ser conectado.
    if (error instanceof OnboardingRejected) {
      console.warn("[meta/onboarding] selection_rejected", {
        reason: error.reason,
        event,
      });
      await setStatus(
        error.retryable ? "not_connected" : "attention_required",
        `Embedded Signup: ${error.reason}`,
      );

      return Response.json(
        { error: error.userMessage, reason: error.reason, canRetry: true },
        { status: 409 },
      );
    }

    const known = error instanceof MetaOnboardingError;

    if (!known) {
      console.error("[meta/onboarding] unexpected_failure", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }

    await setStatus(
      "attention_required",
      known ? error.adminHint : "Falha inesperada no onboarding.",
    );

    return Response.json(
      {
        error: known
          ? error.userMessage
          : "Não foi possível concluir a conexão. Tente novamente.",
        canRetry: true,
      },
      { status: known && error.retryable ? 503 : 400 },
    );
  }
}

export async function DELETE() {
  const user = await getOptionalCurrentUser();

  if (!user?.active || user.role !== "client" || !user.clientId) {
    return Response.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return Response.json(
      { error: "Serviço indisponível no momento." },
      { status: 503 },
    );
  }

  // Desconectar apaga a credencial e para a fila. Leads e conversões já
  // registradas continuam existindo.
  const { error } = await admin.rpc("meta_disconnect_whatsapp", {
    p_client_id: user.clientId,
  });

  if (error) {
    return Response.json(
      { error: "Não foi possível desconectar agora." },
      { status: 500 },
    );
  }

  return Response.json({ status: "disconnected" });
}
