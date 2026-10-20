"use server";

import { z } from "zod";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { buildRequestBody, readMetaOutcome } from "@/lib/conversions/capi-payload";
import { graphUrl } from "@/lib/meta/conversions-config";
import { redactSecrets } from "@/lib/meta/onboarding-diagnostics";
import { openSecret } from "@/lib/meta/secret-box";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Evento de teste da Conversions API com a credencial SALVA do cliente.
//
// Envia UM LeadSubmitted ao Test Events do Dataset, com o payload montado pelo
// mesmo código do dispatcher (action_source business_messaging, messaging_channel
// whatsapp, user_data { ctwa_clid, whatsapp_business_account_id }). O token é
// decifrado só aqui, vai apenas no cabeçalho e nunca volta para o navegador.
// Não toca na fila: o teste não marca nem consome nenhum evento real.
//
// Atenção (Meta): eventos com test_event_code também entram na medição. Por
// isso o envio exige o código e uma confirmação explícita.

export type CapiTestResult = {
  error?: string;
  result?: {
    httpStatus: number | null;
    accepted: boolean;
    eventsReceived: number | null;
    fbtraceId: string | null;
    metaCode: number | null;
    subcode: number | null;
    message: string | null;
    datasetId: string;
    credentialSource: string | null;
    sentAt: string;
  };
};

const inputSchema = z.object({
  clientId: z.string().uuid(),
  testEventCode: z
    .string()
    .trim()
    .regex(/^TEST[A-Za-z0-9]{1,40}$/, "Use o código da aba Eventos de teste (ex.: TEST12345)."),
  confirm: z.literal("on", {
    message: "Confirme que o evento de teste também entra na medição da Meta.",
  }),
});

type Target = {
  dataset_id: string | null;
  waba_id: string | null;
  access_token: string | null;
  credential_source: string | null;
  ctwa_clid: string | null;
};

export async function sendCapiTestEventAction(
  _previous: CapiTestResult,
  formData: FormData,
): Promise<CapiTestResult> {
  const user = await getOptionalCurrentUser();
  const admin = createSupabaseAdminClient();

  if (!user || user.role !== "admin" || !user.active || !admin) {
    return { error: "Só um administrador logado pode enviar o evento de teste." };
  }

  const parsed = inputSchema.safeParse({
    clientId: formData.get("clientId"),
    testEventCode: formData.get("testEventCode"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { data, error } = await admin.rpc("admin_capi_test_target", {
    p_client_id: parsed.data.clientId,
  });

  if (error) {
    return {
      error:
        "Não foi possível ler a credencial do cliente. Confira se a migração 20261020120000 foi aplicada.",
    };
  }

  const target = ((data as Target[] | null) ?? [])[0];

  if (!target?.dataset_id) return { error: "Este cliente ainda não tem Dataset." };
  if (!target.waba_id) return { error: "Este cliente ainda não tem WABA conectado." };
  if (!target.access_token) return { error: "Este cliente não tem credencial salva." };
  if (!target.ctwa_clid) {
    return {
      error:
        "Nenhum lead deste cliente tem ctwa_clid. Mande uma mensagem por um anúncio Click-to-WhatsApp e tente de novo.",
    };
  }

  let token: string;
  try {
    token = openSecret(target.access_token);
  } catch {
    return { error: "Não foi possível decifrar a credencial salva." };
  }

  const now = Math.floor(Date.now() / 1000);
  const body: Record<string, unknown> = buildRequestBody({
    lead_id: "teste-admin",
    dataset_id: target.dataset_id,
    waba_id: target.waba_id,
    access_token: null,
    event_name: "LeadSubmitted",
    event_id: `teste-LeadSubmitted-${now}`,
    event_time: now,
    action_source: "business_messaging",
    user_data: {
      ctwa_clid: target.ctwa_clid,
      whatsapp_business_account_id: target.waba_id,
    },
  });
  body.test_event_code = parsed.data.testEventCode;

  let status: number | null = null;
  let payload: unknown = null;
  let networkError: string | null = null;

  try {
    const response = await fetch(graphUrl(`/${target.dataset_id}/events`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    status = response.status;
    const text = await response.text();
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  } catch (cause) {
    networkError =
      cause instanceof Error && cause.name === "TimeoutError" ? "tempo esgotado" : "falha de rede";
  }

  const outcome = readMetaOutcome({ status, body: payload, networkError });
  const meta = (payload ?? {}) as {
    events_received?: number;
    fbtrace_id?: string;
    error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
  };

  // Sem token, sem segredos: só o que a Meta respondeu, já sem nada sensível.
  console.info("[capi/teste] resultado", {
    httpStatus: status,
    accepted: outcome.ok,
    metaCode: meta.error?.code ?? null,
    subcode: meta.error?.error_subcode ?? null,
  });

  return {
    result: {
      httpStatus: status,
      accepted: outcome.ok,
      eventsReceived: typeof meta.events_received === "number" ? meta.events_received : null,
      fbtraceId: meta.fbtrace_id ?? meta.error?.fbtrace_id ?? null,
      metaCode: meta.error?.code ?? null,
      subcode: meta.error?.error_subcode ?? null,
      message: meta.error?.message
        ? redactSecrets(meta.error.message).slice(0, 500)
        : networkError,
      datasetId: target.dataset_id,
      credentialSource: target.credential_source,
      sentAt: new Date().toISOString(),
    },
  };
}
