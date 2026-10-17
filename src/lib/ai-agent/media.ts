import type { AudioTranscriber, MediaKind } from "./event";

/** Phase 2 adapter: point this at an authenticated faster-whisper service on
 * the agency VPS after validating media retrieval against the installed WAHA.
 * No invented endpoint, third-party upload, or arbitrary media URL download.
 */
const unavailable: AudioTranscriber = async () => null;
export async function prepareTurnInput(
  input: {
    sessionName: string;
    chatId: string;
    messages: {
      body: string;
      media_kind: MediaKind;
      provider_message_id: string | null;
    }[];
  },
  transcribe: AudioTranscriber = unavailable,
): Promise<{ incoming: string; media: MediaKind; hasText: boolean }> {
  const texts: string[] = [];
  // Texto digitado (mensagens e legendas), sem os rótulos "📷 Imagem". Foto
  // junto com texto não pode fazer a IA ignorar o que o lead escreveu.
  const written: string[] = [];
  let media: MediaKind = "text";
  for (const message of input.messages) {
    if (message.media_kind === "audio" && message.provider_message_id) {
      try {
        const transcript = await transcribe({
          sessionName: input.sessionName,
          chatId: input.chatId,
          messageId: message.provider_message_id,
          signal: AbortSignal.timeout(15000),
        });
        if (
          transcript &&
          transcript.confidence >= 0.8 &&
          transcript.text.trim()
        ) {
          texts.push(transcript.text.slice(0, 8000));
          written.push(transcript.text.slice(0, 8000));
          continue;
        }
      } catch {
        /* Preserve the audio in history and offer text instead. */
      }
    }
    texts.push(message.body);
    if (message.media_kind === "text") {
      if (message.body.trim()) written.push(message.body);
    } else {
      media = message.media_kind;
      // Mídia é gravada como "📷 Imagem\n<legenda>": a legenda é texto.
      const caption = message.body.split("\n").slice(1).join("\n").trim();
      if (caption) written.push(caption);
    }
  }
  return written.length
    ? { incoming: written.join("\n"), media, hasText: true }
    : { incoming: texts.join("\n"), media, hasText: false };
}
