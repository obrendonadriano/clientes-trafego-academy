import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getWhatsappSessionByName,
  updateWhatsappSessionRecord,
} from "@/lib/whatsapp-server";
import {
  getWahaConfig,
  toWahaSessionStatus,
  wahaPhoneNumber,
  type WahaSession,
} from "@/lib/waha";

type WahaWebhook = {
  event?: string;
  session?: string;
  payload?: {
    status?: string;
  };
  me?: WahaSession["me"];
};

function isValidSignature(rawBody: string, received: string, secret: string) {
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const normalized = received.replace(/^sha512=/i, "").toLowerCase();

  if (!/^[a-f0-9]+$/.test(normalized) || normalized.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(normalized, "hex"), Buffer.from(expected, "hex"));
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    const config = await getWahaConfig();
    const signature = request.headers.get("x-webhook-hmac") ?? "";

    if (!isValidSignature(rawBody, signature, config.webhookSecret)) {
      return Response.json({ error: "Assinatura inválida." }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as WahaWebhook;
    if (body.event !== "session.status" || !body.session) {
      return new Response(null, { status: 204 });
    }

    const record = await getWhatsappSessionByName(body.session);
    if (!record) {
      return new Response(null, { status: 204 });
    }

    const status = toWahaSessionStatus(body.payload?.status);
    const now = new Date().toISOString();
    const session: WahaSession = { me: body.me };

    await updateWhatsappSessionRecord(record.client_id, {
      status,
      phone_number: status === "WORKING" ? wahaPhoneNumber(session) : record.phone_number,
      push_name: status === "WORKING" ? body.me?.pushName ?? null : record.push_name,
      conectado_em: status === "WORKING" ? record.conectado_em ?? now : record.conectado_em,
      desconectado_em: status === "STOPPED" ? now : record.desconectado_em,
      ultimo_erro: status === "FAILED" ? "A sessão WAHA informou uma falha." : null,
      ultimo_evento_em: now,
    });

    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Webhook inválido." }, { status: 400 });
  }
}
