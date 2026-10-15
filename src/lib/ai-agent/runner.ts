import "server-only";
import { advanceConversation, type PipelineResponse } from "./pipeline";

// Substitui o laço "esperar e chamar /passo" que antes rodava no n8n. Roda
// dentro de after(), depois que o WAHA já recebeu o 200. Todo estado continua
// no Postgres (lease, revisão, fila): se esta função morrer no meio, nada se
// perde — a próxima mensagem do lead retoma a conversa de onde parou.

// A rota tem maxDuration de 300s. Deixa folga para um passo inteiro (extração
// com retentativas + envio ao WAHA) terminar antes do limite da função.
export const LOOP_BUDGET_MS = 200_000;
// Mesmo corte do workflow antigo.
const MAX_STEPS = 120;
// Conversas que passam do orçamento continuam em outra invocação. Limite de
// saltos para um erro de lógica nunca virar um laço infinito de funções.
export const MAX_HOPS = 5;

type Waiting = Extract<PipelineResponse, { acao: "aguardar" }>;

export type LoopOptions = {
  hop: number;
  // Chamada a /whatsapp/ia/waha com { continuar } para seguir em nova função.
  continueAt: (step: Waiting, hop: number) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runConversationLoop(
  first: PipelineResponse,
  options: LoopOptions,
) {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const startedAt = now();
  let step = first;

  try {
    for (let i = 0; i < MAX_STEPS && step.acao === "aguardar"; i++) {
      if (now() - startedAt + step.esperarMs > LOOP_BUDGET_MS) {
        if (options.hop >= MAX_HOPS) {
          console.warn("[ia/loop] limite de continuações atingido");
          return;
        }
        await options.continueAt(step, options.hop + 1);
        return;
      }
      await sleep(step.esperarMs);
      step = await advanceConversation({
        sessionName: step.sessionName,
        chatId: step.chatId,
      });
    }
  } catch (error) {
    // Sem telefone nem conteúdo no log. O estado da conversa já registra a falha.
    console.error("[ia/loop] falha", {
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
  }
}
