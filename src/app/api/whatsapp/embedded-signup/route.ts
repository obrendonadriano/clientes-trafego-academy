import { after } from "next/server";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sealSecret, isSecretBoxConfigured } from "@/lib/meta/secret-box";
import {
  MetaOnboardingError,
  runOnboarding,
} from "@/lib/meta/whatsapp-onboarding";
import { OnboardingRejected } from "@/lib/meta/onboarding-selection";
import { dispatchQuietly } from "@/lib/conversions/dispatcher";

// Conclui o Embedded Signup. O navegador entrega apenas o código de autorização
// e os identificadores que a Meta devolveu no popup oficial; a troca por token,
// a conferência do WABA/número, a assinatura do webhook e a resolução do
// Dataset acontecem todas aqui. Nenhum segredo volta na resposta.
//
// A elegibilidade do número é decidida pela Meta dentro do popup. Quando ela
// não libera um número, nada é conectado: o cliente recebe uma explicação e
// pode tentar de novo mais tarde.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^\d{5,30}$/;

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

  let body: { code?: unknown; wabaId?: unknown; phoneNumberId?: unknown };

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

  if (!code || code.length > 2000) {
    return Response.json(
      { error: "Autorização da Meta ausente. Refaça a conexão." },
      { status: 400 },
    );
  }

  await admin.rpc("meta_set_connection_status", {
    p_client_id: user.clientId,
    p_status: "onboarding",
    p_last_error: null,
  });

  try {
    const result = await runOnboarding({ code, wabaId, phoneNumberId });

    const status = result.datasetId ? "active" : "dataset_pending";
    const { error } = await admin.rpc("meta_save_whatsapp_connection", {
      p_client_id: user.clientId,
      p_waba_id: result.wabaId,
      p_phone_number_id: result.phoneNumberId,
      p_display_phone_number: result.displayPhoneNumber,
      p_verified_name: result.verifiedName,
      p_business_id: result.businessId,
      p_dataset_id: result.datasetId,
      p_is_on_biz_app: result.isOnBizApp,
      p_platform_type: result.platformType,
      p_webhook_subscribed: result.webhookSubscribed,
      p_status: status,
      // O token entra cifrado; o schema privado é a segunda barreira.
      p_access_token: sealSecret(result.accessToken),
      p_token_scopes: result.scopes.join(","),
      p_last_error: result.datasetError ?? result.coexistenceWarning,
    });

    if (error) {
      // Conflito de WABA/número já vinculado a outro cliente: recusar é o
      // comportamento correto, senão os leads iriam para o tenant errado.
      const duplicate = error.code === "23505";
      await admin.rpc("meta_set_connection_status", {
        p_client_id: user.clientId,
        p_status: "attention_required",
        p_last_error: error.message,
      });

      return Response.json(
        {
          error: duplicate
            ? "Este WhatsApp já está conectado a outra conta. Fale com o seu gestor."
            : "Não foi possível salvar a conexão. Tente novamente.",
        },
        { status: duplicate ? 409 : 500 },
      );
    }

    if (result.datasetId) {
      after(() => dispatchQuietly());
    }

    return Response.json({
      status,
      connected: true,
      phone: result.displayPhoneNumber,
      trackingReady: Boolean(result.datasetId),
    });
  } catch (error) {
    // Número inelegível ou não compartilhado não é falha do sistema: é a Meta
    // dizendo que aquele número ainda não pode ser conectado. O cliente volta
    // para "não conectado" e tenta de novo depois, sem estado pela metade.
    if (error instanceof OnboardingRejected) {
      await admin.rpc("meta_set_connection_status", {
        p_client_id: user.clientId,
        p_status: error.retryable ? "not_connected" : "attention_required",
        p_last_error: `Embedded Signup: ${error.reason}`,
      });

      return Response.json(
        { error: error.userMessage, reason: error.reason, canRetry: true },
        { status: 409 },
      );
    }

    const known = error instanceof MetaOnboardingError;

    // Um erro da Meta não pode deixar o cliente num estado inconsistente: ele
    // volta a "não conectado" e pode tentar de novo.
    await admin.rpc("meta_set_connection_status", {
      p_client_id: user.clientId,
      p_status: "attention_required",
      p_last_error: known ? error.message : "Falha inesperada no onboarding.",
    });

    console.error("[conversoes/embedded-signup] falha", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "erro desconhecido",
    });

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
