import { createHmac } from "node:crypto";
import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMetaConversionsConfig } from "@/lib/meta/conversions-config";
import { safeEqualHex } from "@/lib/meta/secret-box";
import { dispatchQuietly } from "@/lib/conversions/dispatcher";
import {
  ingestWebhookMessages,
  planWebhookResponse,
  type WebhookBody,
} from "@/lib/conversions/webhook-ingest";

// Webhook oficial da Cloud API.
//
// Este endpoint é público — a Meta chama sem sessão. Por isso:
//   1. a assinatura X-Hub-Signature-256 é conferida contra o app secret;
//   2. o tenant sai SEMPRE do phone_number_id/waba_id já cadastrados, nunca de
//      um identificador presente no corpo;
//   3. só vira lead a mensagem com referral de Click-to-WhatsApp. Uma mensagem
//      orgânica atualiza o "último webhook" e nada mais — ninguém que escreve
//      espontaneamente é contado como conversão de anúncio;
//   4. a mesma entrega repetida não cria um segundo lead (o message id é único);
//   5. se a gravação de qualquer mensagem falhar, a resposta é 500 — depois de
//      tentar todas as outras do mesmo payload — para a Meta reentregar.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Todas as mensagens do payload são tentadas, mesmo que uma falhe.
  const outcome = await ingestWebhookMessages(body, (args) =>
    admin.rpc("meta_ingest_ad_lead", args),
  );
  const plan = planWebhookResponse(outcome);

  // LeadSubmitted entra na fila pelo gatilho do banco; o envio é tentado já,
  // sem segurar a resposta. Vale mesmo com outra mensagem do lote falhando:
  // o lead novo já está gravado.
  if (plan.dispatch) {
    after(() => dispatchQuietly());
  }

  // A Meta reentrega enquanto não receber 200. Se alguma gravação falhou, 500
  // pede a reentrega do payload; o que já entrou não duplica, porque a RPC é
  // idempotente por wa_message_id e ctwa_clid.
  return new Response(null, { status: plan.status });
}
