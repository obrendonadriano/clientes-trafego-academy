export type MediaKind = "text" | "audio" | "image" | "document";
export type IncomingEvent = {
  sessionName: string;
  chatId: string;
  messageId: string;
  fromMe: boolean;
  body: string;
  pushName: string | null;
  mediaKind: MediaKind;
  timestamp: string | null;
  // Veio de um clique em anúncio (Click-to-WhatsApp): o WhatsApp anexa o
  // cartão do anúncio (externalAdReply / ctwaClid) à mensagem.
  fromAd?: boolean;
};

const AD_KEYS = /^(?:externalAdReply|ctwaClid|ctwaContext|ctwaPayload|ctwaSignals)$/i;

/** Procura o cartão do anúncio em qualquer nível do payload (GOWS, WEBJS, NOWEB). */
export function hasAdReferral(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 8) return false;
  if (Array.isArray(value)) return value.some((item) => hasAdReferral(item, depth + 1));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (AD_KEYS.test(key) && child !== null && child !== undefined && child !== "") return true;
    if (key === "conversionSource" && /ad/i.test(text(child))) return true;
    if (hasAdReferral(child, depth + 1)) return true;
  }
  return false;
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** "5511...@s.whatsapp.net" (GOWS interno) vira "5511...@c.us". */
const asChat = (v: unknown) =>
  text(v).replace(/^(\d{10,15})@s\.whatsapp\.net$/, "$1@c.us");

/**
 * Onde o contato pode vir. Mensagem enviada pelo próprio celular (fromMe)
 * nem sempre traz `to`: o GOWS manda o chat em _data.Info.Chat e o ID da
 * mensagem embute o contato ("true_5511...@c.us_ABC").
 */
export function chatCandidates(payload: Record<string, unknown>, fromMe: boolean) {
  const data = record(payload._data);
  const info = record(data.Info);
  const key = record(data.key);
  const id = payload.id;
  const idText = text(id) || text(record(id)._serialized);
  const fromId = /^(?:true|false)_([^_]+)_/.exec(idText)?.[1] ?? "";
  return (
    fromMe
      ? [payload.to, info.Chat, key.remoteJid, fromId, info.RecipientAlt]
      : [payload.from, info.Chat, key.remoteJid, fromId, info.SenderAlt]
  )
    .map(asChat)
    .filter(Boolean);
}

export function parseIncomingEvent(input: unknown): IncomingEvent | null {
  const root = record(input),
    payload = root.payload ? record(root.payload) : root,
    data = record(payload._data);
  if (root.event && !["message", "message.any"].includes(text(root.event)))
    return null;
  const fromMe = payload.fromMe === true || data.fromMe === true;
  const candidates = chatCandidates(payload, fromMe);
  // Grupo (@g.us), canal e status nunca viram conversa.
  const isGroup = candidates.some((chat) => /@(g\.us|newsletter|broadcast)$/.test(chat));
  const chatId =
    text(root.chatId) ||
    (isGroup ? "" : candidates.find((chat) => /^\d{10,15}@c\.us$/.test(chat)) ?? "");
  const sessionName = text(root.sessionName) || text(root.session);
  const id = payload.id ?? root.messageId;
  const messageId =
    text(id) || text(record(id)._serialized) || text(record(id).id);
  if (!sessionName || !messageId || !/^\d{10,15}@c\.us$/.test(chatId))
    return null;
  const media = record(payload.media),
    mime = text(media.mimetype);
  const type = text(payload.type) || text(data.type);
  const mediaKind: MediaKind =
    payload.mediaKind === "audio" ||
    mime.startsWith("audio/") ||
    ["ptt", "audio", "voice"].includes(type)
      ? "audio"
      : payload.mediaKind === "image" ||
          mime.startsWith("image/") ||
          type === "image"
        ? "image"
        : payload.mediaKind === "document" ||
            payload.hasMedia === true ||
            type === "document"
          ? "document"
          : "text";
  const body = (text(payload.body) || text(payload.caption))
    .trim()
    .slice(0, 8000);
  if (!body && mediaKind === "text") return null;
  const stamp = payload.timestamp ?? root.timestamp;
  const date =
    typeof stamp === "number"
      ? new Date(stamp < 1e12 ? stamp * 1000 : stamp)
      : typeof stamp === "string"
        ? new Date(stamp)
        : null;
  return {
    sessionName,
    chatId,
    messageId,
    fromMe,
    body,
    mediaKind,
    fromAd: !fromMe && hasAdReferral(payload),
    pushName:
      (
        text(root.notifyName) ||
        text(data.notifyName) ||
        text(payload.notifyName)
      ).slice(0, 160) || null,
    timestamp:
      date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
  };
}

// An adapter can provide a verified transcript in phase 2. Never fetch an arbitrary webhook media URL.
export type AudioTranscriber = (input: {
  sessionName: string;
  chatId: string;
  messageId: string;
  signal: AbortSignal;
}) => Promise<{ text: string; confidence: number } | null>;
export const MEDIA_LABELS = {
  audio: "🎤 Áudio",
  image: "📷 Imagem",
  document: "📎 Documento",
  text: "",
};
