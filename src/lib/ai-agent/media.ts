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
): Promise<{ incoming: string; media: MediaKind }> {
  const texts: string[] = [];
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
          continue;
        }
      } catch {
        /* Preserve the audio in history and offer text instead. */
      }
    }
    texts.push(message.body);
    if (message.media_kind !== "text") media = message.media_kind;
  }
  return { incoming: texts.join("\n"), media };
}
