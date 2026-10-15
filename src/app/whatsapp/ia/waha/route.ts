import { after } from "next/server";
import { z } from "zod";
import { AI_WEBHOOK_PATH, appUrl } from "@/lib/app-url";
import {
  authenticateAiWebhook,
  ingestInboundEvent,
  parseIncomingEvent,
} from "@/lib/ai-agent/pipeline";
import { runConversationLoop } from "@/lib/ai-agent/runner";
import { AiAgentError } from "@/lib/ai-agent/store";

// Webhook do Atendimento IA chamado DIRETO pelo WAHA (evento message.any),
// sem n8n. Responde na hora e cuida do tempo (agrupamento, "digitando",
// intervalos) dentro de after(), na mesma função.
export const maxDuration = 300;

const continuationSchema = z.object({
  sessionName: z.string().min(1).max(200),
  chatId: z.string().regex(/^\d{10,15}@c\.us$/),
  esperarMs: z.number().int().min(0).max(30_000),
  hop: z.number().int().min(1).max(10),
});

export async function POST(request: Request) {
  try {
    const config = await authenticateAiWebhook(request);
    const body: unknown = await request.json();
    const selfUrl = appUrl(request, AI_WEBHOOK_PATH);

    const startLoop = (
      step: Awaited<ReturnType<typeof ingestInboundEvent>>,
      hop: number,
    ) =>
      after(() =>
        runConversationLoop(step, {
          hop,
          // Passou do orçamento desta função: segue numa nova invocação.
          continueAt: async (next, nextHop) => {
            const response = await fetch(selfUrl, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-trafegoacademy-secret": config.webhookSecret,
              },
              body: JSON.stringify({
                continuar: {
                  sessionName: next.sessionName,
                  chatId: next.chatId,
                  esperarMs: next.esperarMs,
                  hop: nextHop,
                },
              }),
            });
            if (!response.ok) {
              console.error("[ia/waha] continuação recusada", {
                status: response.status,
              });
            }
          },
        }),
      );

    const continuation =
      body && typeof body === "object" && "continuar" in body
        ? continuationSchema.safeParse(body.continuar)
        : null;

    if (continuation) {
      if (!continuation.success) {
        return Response.json({ ok: false }, { status: 400 });
      }
      const { hop, ...step } = continuation.data;
      startLoop({ acao: "aguardar", ...step }, hop);
      return Response.json({ ok: true }, { status: 202 });
    }

    const event = parseIncomingEvent(body);

    if (!event) {
      return Response.json({ ok: true, ignorado: true });
    }

    // Gravação idempotente pelo ID da mensagem: se falhar, o 500 faz o WAHA
    // reenviar (retries exponenciais configurados ao conectar).
    const result = await ingestInboundEvent(event);

    if (result.acao === "aguardar") {
      startLoop(result, 0);
    }

    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AiAgentError ? error.status : 500;
    console.error("[ia/waha] falha", { status });
    return Response.json({ ok: false }, { status });
  }
}
