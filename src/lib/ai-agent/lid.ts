import "server-only";

import { wahaFetchJson, type WahaCredentials } from "@/lib/waha";
import { chatCandidates } from "./event";

// O WhatsApp passou a identificar muitos contatos por um id interno
// ("123456789@lid") em vez do telefone ("5531999999999@c.us"). A IA trabalha
// com o telefone (conversa, bloqueio, notificação), então o payload do WAHA é
// reescrito com o número real antes de ser interpretado.

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === "object" ? (value as Json) : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** "5531...@s.whatsapp.net" ou "5531...@c.us" -> "5531...@c.us". */
function asPhoneChat(value: unknown) {
  const match = /^(\d{10,15})@(?:c\.us|s\.whatsapp\.net)$/.exec(text(value));
  return match ? `${match[1]}@c.us` : null;
}

/** Algumas engines já mandam o telefone junto do @lid. */
function phoneFromPayload(payload: Json, fromMe: boolean) {
  const data = record(payload._data);
  const info = record(data.Info);
  const key = record(data.key);
  const candidates = fromMe
    ? [info.RecipientAlt, key.remoteJidAlt, payload.toAlt]
    : [info.SenderAlt, key.remoteJidAlt, payload.fromAlt];
  for (const candidate of candidates) {
    const chat = asPhoneChat(candidate);
    if (chat) return chat;
  }
  return null;
}

export async function resolveLidPayload(
  body: unknown,
  credentials: WahaCredentials,
): Promise<unknown> {
  const root = record(body);
  const payload = record(root.payload);
  const fromMe = payload.fromMe === true;
  const field = fromMe ? "to" : "from";
  // O contato pode vir em `to`/`from`, em _data.Info.Chat ou no ID.
  const candidates = chatCandidates(payload, fromMe);
  if (candidates.some((value) => /^\d{10,15}@c\.us$/.test(value))) return body;
  const chat = candidates.find((value) => value.endsWith("@lid")) ?? "";
  const session = text(root.session);

  if (!chat || !session) return body;

  let phoneChat = phoneFromPayload(payload, fromMe);

  if (!phoneChat) {
    try {
      const result = await wahaFetchJson<{ pn?: string | null }>(
        credentials,
        `/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(chat)}`,
        { method: "GET" },
      );
      phoneChat = asPhoneChat(result?.pn);
    } catch {
      // Sem o mapeamento a mensagem segue como está e o log registra @lid.
      return body;
    }
  }

  return phoneChat
    ? { ...root, payload: { ...payload, [field]: phoneChat } }
    : body;
}
