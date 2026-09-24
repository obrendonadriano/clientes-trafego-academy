import { createHmac } from "node:crypto";
import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMetaConversionsConfig } from "@/lib/meta/conversions-config";
import { safeEqualHex } from "@/lib/meta/secret-box";
import { dispatchQuietly } from "@/lib/conversions/dispatcher";

// Webhook oficial da Cloud API.
//
// Este endpoint é público — a Meta chama sem sessão. Por isso:
//   1. a assinatura X-Hub-Signature-256 é conferida contra o app secret;
//   2. o tenant sai SEMPRE do phone_number_id/waba_id já cadastrados, nunca de
//      um identificador presente no corpo;
//   3. só vira lead a mensagem com referral de Click-to-WhatsApp. Uma mensagem
//      orgânica atualiza o "último webhook" e nada mais — ninguém que escreve
//      espontaneamente é contado como conversão de anúncio;
//   4. a mesma entrega repetida não cria um segundo lead (o message id é único).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Referral = {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  ctwa_clid?: string;
};

type WebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  referral?: Referral;
};

type WebhookValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: WebhookMessage[];
};

type WebhookBody = {
  object?: string;
  entry?: { id?: string; changes?: { field?: string; value?: WebhookValue }[] }[];
};

// Verificação de posse do endpoint, exigida pela Meta ao cadastrar a URL.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const { verifyToken } = await getMetaConversionsConfig();

  if (!verifyToken) {
    return new Response("not configured", { status: 503 });
  }

  const challenge = params.get("hub.challenge") ?? "";

  if (
    params.get("hub.mode") === "subscribe" &&
    safeEqualHex(params.get("hub.verify_token") ?? "", verifyToken)
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("forbidden", { status: 403 });
}

function hasValidSignature(rawBody: string, header: string, appSecret: string) {
  const received = header.replace(/^sha256=/i, "").toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(received)) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqualHex(received, expected);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const { appSecret } = await getMetaConversionsConfig();

  if (!appSecret) {
    return new Response(null, { status: 503 });
  }

  if (
    !hasValidSignature(
      rawBody,
      request.headers.get("x-hub-signature-256") ?? "",
      appSecret,
    )
  ) {
    return Response.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let body: WebhookBody;

  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return new Response(null, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    // 503 faz a Meta reentregar depois, sem perder o lead.
    return new Response(null, { status: 503 });
  }

  let createdLead = false;

  for (const entry of body.entry ?? []) {
    const wabaId = entry.id ?? null;

    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }

      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id ?? null;

      for (const message of value.messages ?? []) {
        const referral = message.referral;
        const phone = message.from ?? null;

        if (!phone) {
          continue;
        }

        const contact = (value.contacts ?? []).find(
          (item) => item.wa_id === phone,
        );
        // O horário original do evento vem da Meta. Ele é preservado no banco
        // e enviado como event_time; nunca é substituído por "agora".
        const seconds = Number(message.timestamp);
        const eventTime = Number.isFinite(seconds) && seconds > 0
          ? new Date(seconds * 1000).toISOString()
          : null;

        const { data, error } = await admin.rpc("meta_ingest_ad_lead", {
          p_phone_number_id: phoneNumberId,
          p_waba_id: wabaId,
          p_wa_message_id: message.id ?? null,
          p_telefone: phone,
          // Sem ctwa_clid a RPC apenas registra o webhook e não cria lead.
          p_ctwa_clid: referral?.ctwa_clid ?? null,
          p_nome: contact?.profile?.name ?? null,
          p_ad_source_id: referral?.source_id ?? null,
          p_ad_source_url: referral?.source_url ?? null,
          p_ad_source_type: referral?.source_type ?? null,
          p_event_time: eventTime,
        });

        if (error) {
          console.error("[conversoes/webhook] ingestão recusada", {
            message: error.message,
          });
          continue;
        }

        const row = Array.isArray(data) ? data[0] : data;

        if (row?.novo) {
          createdLead = true;
        }
      }
    }
  }

  // LeadSubmitted entra na fila pelo gatilho do banco; drenar aqui evita
  // esperar o próximo ciclo do cron.
  if (createdLead) {
    after(() => dispatchQuietly());
  }

  // A Meta reentrega enquanto não receber 200. Responder 200 depois de gravar
  // é o que torna a entrega confiável sem duplicar: a idempotência é por
  // message id no banco.
  return new Response(null, { status: 200 });
}
