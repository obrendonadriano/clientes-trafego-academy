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
};
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const text = (v: unknown) => (typeof v === "string" ? v : "");
export function parseIncomingEvent(input: unknown): IncomingEvent | null {
  const root = record(input),
    payload = root.payload ? record(root.payload) : root,
    data = record(payload._data);
  if (root.event && !["message", "message.any"].includes(text(root.event)))
    return null;
  const fromMe = payload.fromMe === true || data.fromMe === true;
  const chatId = text(root.chatId) || text(fromMe ? payload.to : payload.from);
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
