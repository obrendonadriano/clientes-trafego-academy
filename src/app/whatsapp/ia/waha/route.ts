import { after } from "next/server";
import { z } from "zod";
import { AI_WEBHOOK_PATH, appUrl } from "@/lib/app-url";
import {
  authenticateAiWebhook,
  findStalledChats,
  ingestInboundEvent,
  parseIncomingEvent,
} from "@/lib/ai-agent/pipeline";
import { resolveLidPayload } from "@/lib/ai-agent/lid";
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

/**
 * Por que o payload não virou evento, sem expor número nem texto: tipo do
 * evento e o sufixo do chat (@c.us, @lid, @g.us...).
 */
function describeUnparsed(body: unknown) {
  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const payload = (root.payload && typeof root.payload === "object"
    ? root.payload
    : {}) as Record<string, unknown>;
  const chat = String(payload.fromMe ? payload.to ?? "" : payload.from ?? "");
  return {
    motivo: "evento_nao_reconhecido",
    evento: typeof root.event === "string" ? root.event : null,
    sufixoChat: chat.includes("@") ? chat.slice(chat.indexOf("@")) : null,
    temSessao: typeof root.session === "string",
    // Só os nomes dos campos, para saber onde o WAHA pôs o chat.
    campos: Object.keys(payload).slice(0, 30),
    camposInfo: Object.keys(
      ((payload._data as Record<string, unknown> | undefined)?.Info ?? {}) as object,
    ).slice(0, 30),
  };
}

export async function POST(request: Request) {
  try {
    const config = await authenticateAiWebhook(request);
    const body: unknown = await request.json();
    const selfUrl = appUrl(request, AI_WEBHOOK_PATH);

    const runLoop = (
      step: Awaited<ReturnType<typeof ingestInboundEvent>>,
      hop: number,
    ) =>
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
      });
    const startLoop = (
      step: Awaited<ReturnType<typeof ingestInboundEvent>>,
      hop: number,
    ) => after(() => runLoop(step, hop));

    // Rede de segurança: a cada webhook desta sessão (no máximo a cada 30 s),
    // retoma conversas que ficaram sem resposta por erro ou função encerrada.
    const sweep = (sessionName: unknown) => {
      if (typeof sessionName !== "string" || !sessionName) return;
      after(async () => {
        try {
          const chats = await findStalledChats(sessionName);
          await Promise.all(
            chats.map((chatId) =>
              runLoop({ acao: "aguardar", sessionName, chatId, esperarMs: 0 }, 0),
            ),
          );
        } catch (error) {
          console.error("[ia/waha] varredura falhou", {
            message: error instanceof Error ? error.message : "erro desconhecido",
          });
        }
      });
    };

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
      sweep(step.sessionName);
      return Response.json({ ok: true }, { status: 202 });
    }

    sweep((body as { session?: unknown } | null)?.session);

    // Contato identificado por @lid vira o telefone real antes da leitura.
    const event = parseIncomingEvent(await resolveLidPayload(body, config));

    if (!event) {
      console.info("[ia/waha] ignorado", describeUnparsed(body));
      return Response.json({ ok: true, ignorado: true });
    }

    // Gravação idempotente pelo ID da mensagem: se falhar, o 500 faz o WAHA
    // reenviar (retries exponenciais configurados ao conectar).
    const result = await ingestInboundEvent(event);

    if (result.acao === "aguardar") {
      startLoop(result, 0);
    } else if (result.acao === "ignorar") {
      const payload = ((body as { payload?: Record<string, unknown> } | null)?.payload ??
        {}) as Record<string, unknown>;
      const message = ((payload._data as Record<string, unknown> | undefined)?.Message ??
        {}) as Record<string, unknown>;
      console.info("[ia/waha] ignorado", {
        motivo: result.motivo,
        fromMe: event.fromMe,
        fromAd: event.fromAd ?? false,
        // Só nomes de campos (nunca conteúdo): confirma onde vem o anúncio.
        ...(result.motivo === "sem_frase_de_ativacao"
          ? {
              camposData: Object.keys((payload._data ?? {}) as object).slice(0, 30),
              camposMensagem: Object.keys(message).slice(0, 30),
            }
          : {}),
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AiAgentError ? error.status : 500;
    console.error("[ia/waha] falha", {
      status,
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
    return Response.json({ ok: false }, { status });
  }
}
