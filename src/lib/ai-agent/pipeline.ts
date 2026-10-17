import "server-only";
import { timingSafeEqual, randomUUID } from "node:crypto";
import {
  getWahaConfig,
  resolveWahaChatId,
  sendWahaText,
  setWahaTyping,
  wahaMessageId,
} from "@/lib/waha";
import { buildQualifiedLeadNotification, runConversationTurn } from "./engine";
import { fromWahaChatId } from "./shared";
import { businessHours, matchesActivationPhrase } from "./config";
import { isNumberBlocked } from "./blocked";
import { MEDIA_LABELS, type IncomingEvent } from "./event";
import { buildDelaysForMessages } from "./humanize";
import { transition } from "./transitions";
import { prepareTurnInput } from "./media";
import { DISQUALIFICATION_REASONS, offHoursReply } from "./policy";
import { hasAiAttendanceSegment } from "@/lib/segments";
import {
  AiAgentError,
  findSessionOwner,
  getAiAgentSettings,
  getClientPlan,
  getClientSegment,
  setDisqualificationReason,
  findConversation,
  findConversationById,
  getNextOutboundMessage,
  getUnprocessedInbound,
} from "./store";
export { parseIncomingEvent } from "./event";
// Gravado em last_question quando a mensagem final (qualificado/quitado) é
// entregue. Daí em diante a IA não responde mais aquele lead.
export const ATTENDANCE_CLOSED = "closed";
// Quitado/fora do perfil não recebe mensagem, então só o qualificado encerra
// por aqui; o desqualificado é encerrado pelo próprio status.
const CLOSING_REASONS = new Set(["policy_qualified"]);

/** Encerrado e sem "Retomar IA" depois da mensagem final. */
function isAttendanceClosed(conversation: {
  last_question: string | null;
  ai_resumed_at: string | null;
  last_outbound_at: string | null;
}) {
  if (conversation.last_question !== ATTENDANCE_CLOSED) return false;
  const resumed = conversation.ai_resumed_at
    ? Date.parse(conversation.ai_resumed_at)
    : 0;
  const closedAt = conversation.last_outbound_at
    ? Date.parse(conversation.last_outbound_at)
    : 0;
  return !(resumed > closedAt);
}

export type PipelineResponse =
  | { acao: "aguardar"; esperarMs: number; sessionName: string; chatId: string }
  | { acao: "fim" | "ignorar"; motivo?: string };
function safeCompare(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * O WAHA envia no header o segredo dos webhooks (o valor que o admin salva em
 * Configurações → WhatsApp); a continuação do laço usa o mesmo. Assim não há
 * credencial nova para administrar e nenhum segredo trafega no corpo.
 */
export async function authenticateAiWebhook(request: Request) {
  const config = await getWahaConfig();
  const received =
    request.headers.get("x-trafegoacademy-secret") ??
    request.headers.get("x-webhook-secret") ??
    "";

  if (!received || !safeCompare(received, config.webhookSecret)) {
    throw new AiAgentError("Assinatura inválida.", 401);
  }

  return config;
}

const wait = (
  sessionName: string,
  chatId: string,
  ms: number,
): PipelineResponse => ({
  acao: "aguardar",
  sessionName,
  chatId,
  esperarMs: Math.max(250, Math.min(ms, 30000)),
});
const end = (): PipelineResponse => ({ acao: "fim" });
async function typing(session: string, chatId: string, enabled: boolean) {
  try {
    await setWahaTyping(await getWahaConfig(), {
      session,
      chatId,
      typing: enabled,
    });
  } catch {
    console.warn("[ia] presence_unavailable");
  }
}

export async function ingestInboundEvent(
  event: IncomingEvent,
): Promise<PipelineResponse> {
  // `motivo` vai para o log (sem telefone/conteúdo) para diagnosticar por que
  // uma mensagem não virou atendimento.
  const ignore = (motivo: string): PipelineResponse => ({
    acao: "ignorar",
    motivo,
  });
  const number = fromWahaChatId(event.chatId);
  if (!number) return ignore("chat_invalido");
  const owner = await findSessionOwner(event.sessionName);
  if (!owner) return ignore("sessao_desconhecida");
  if (number === owner.phoneNumber) return ignore("proprio_numero");
  const settings = await getAiAgentSettings(owner.clientId);
  if (!settings) return ignore("ia_sem_configuracao");
  if (number === settings.notificationWhatsapp)
    return ignore("numero_de_notificacao");
  // Atendimento nichado: só clientes de compra e aquisição de veículos.
  if (!hasAiAttendanceSegment(await getClientSegment(owner.clientId)))
    return ignore("segmento");
  // Número bloqueado pelo cliente: nem grava, nem responde.
  if (await isNumberBlocked(owner.clientId, number))
    return ignore("numero_bloqueado");
  // Frase de ativação: só abre conversa nova quem chega com ela. Mensagens
  // do próprio número para quem não é lead também não viram conversa.
  const activation = settings.knowledge.activation;
  if (activation.enabled) {
    const existing = await findConversation(owner.clientId, number);
    if (!existing) {
      if (event.fromMe) return ignore("enviada_pelo_proprio_whatsapp");
      if (event.mediaKind !== "text") return ignore("midia_sem_conversa");
      if (!matchesActivationPhrase(event.body, activation.phrases))
        return ignore("sem_frase_de_ativacao");
    }
  }
  // Even during human takeover/disabled automation, preserve the conversation history.
  const result = await transition(owner.clientId, "ingest", {
    number,
    chatId: event.chatId,
    messageId: event.messageId,
    fromMe: event.fromMe,
    body:
      event.mediaKind === "text"
        ? event.body
        : `${MEDIA_LABELS[event.mediaKind]}${event.body ? `\n${event.body}` : ""}`,
    displayName: event.pushName,
    mediaKind: event.mediaKind,
    sourceAt: event.timestamp,
  });
  if (result.stopTyping) await typing(event.sessionName, event.chatId, false);
  return result.schedule
    ? wait(event.sessionName, event.chatId, settings.debounceMs)
    : end();
}

export async function advanceConversation(input: {
  sessionName: string;
  chatId: string;
}): Promise<PipelineResponse> {
  const { sessionName, chatId } = input;
  const number = fromWahaChatId(chatId);
  const owner = await findSessionOwner(sessionName);
  if (!number || !owner) return end();
  const settings = await getAiAgentSettings(owner.clientId);
  const initial = await findConversation(owner.clientId, number);
  if (!initial) return end();
  const base = { conversationId: initial.id };
  const reconcile = await transition(owner.clientId, "reconcile", base);
  if (reconcile.stopTyping) await typing(sessionName, chatId, false);
  if (reconcile.busy) return wait(sessionName, chatId, 1000);
  if (
    !settings?.enabled ||
    owner.status !== "WORKING" ||
    (await getClientPlan(owner.clientId)) !== "complete" ||
    !hasAiAttendanceSegment(await getClientSegment(owner.clientId))
  ) {
    await typing(sessionName, chatId, false);
    return end();
  }
  const token = randomUUID();
  const claim = await transition(owner.clientId, "claim", { ...base, token });
  if (!claim.ok) {
    const fresh = await findConversationById(owner.clientId, initial.id);
    return fresh?.human_takeover ? end() : wait(sessionName, chatId, 2000);
  }
  const guard = { ...base, token, revision: claim.revision };
  const tx = (action: string, data: Record<string, unknown> = {}) =>
    transition(owner.clientId, action, { ...guard, ...data });
  try {
    const conversation = await findConversationById(owner.clientId, initial.id);
    if (!conversation || conversation.human_takeover) return end();
    // Bloqueado no meio da conversa: cancela o que estava na fila e consome
    // as mensagens recebidas sem responder.
    if (await isNumberBlocked(owner.clientId, number)) {
      await tx("cancel_pending");
      await typing(sessionName, chatId, false);
      if ((await getUnprocessedInbound(conversation.id)).length)
        await tx("commit", {
          messages: [],
          reason: "blocked_number",
          runId: randomUUID(),
          startedAt: new Date().toISOString(),
        });
      return end();
    }
    const pending = await getNextOutboundMessage(conversation.id);
    if (pending) {
      const hours = businessHours(settings.alwaysOn, settings.businessSchedule);
      if (!hours.open && !pending.closed_period) {
        await tx("cancel_pending");
        await typing(sessionName, chatId, false);
        return wait(sessionName, chatId, 500);
      }
      if (!(await tx("typing", { messageId: pending.id })).ok)
        return wait(sessionName, chatId, 500);
      if (settings.typingEnabled) await typing(sessionName, chatId, true);
      const started = pending.typing_started_at
        ? Date.parse(pending.typing_started_at)
        : Date.now();
      const remaining = pending.delay_ms - (Date.now() - started);
      if (remaining > 0) return wait(sessionName, chatId, remaining);
      const credentials = await getWahaConfig();
      // Last atomic revision/takeover/plan gate, immediately before WAHA network send.
      if (!(await tx("send", { messageId: pending.id })).ok) {
        await typing(sessionName, chatId, false);
        return wait(sessionName, chatId, 500);
      }
      try {
        const sent = await sendWahaText(credentials, {
          session: sessionName,
          chatId,
          text: pending.body,
        });
        const providerId = wahaMessageId(sent);
        if (!providerId) throw new Error("missing_ack");
        await tx("sent", { messageId: pending.id, providerId });
      } catch {
        await tx("send_failed", { messageId: pending.id });
      } finally {
        await typing(sessionName, chatId, false);
      }
      return wait(sessionName, chatId, 300);
    }
    const inbound = await getUnprocessedInbound(conversation.id);
    // Atendimento encerrado ou lead fora do perfil: consome as mensagens sem
    // chamar a IA e sem enviar nada. Qualificado que volta a escrever fica
    // com a equipe; desqualificado não é lead e segue em silêncio.
    const disqualified = conversation.status === "disqualified";
    if (inbound.length && (disqualified || isAttendanceClosed(conversation))) {
      await tx("commit", {
        messages: [],
        human: !disqualified,
        reason: disqualified ? "disqualified_silent" : "attendance_closed",
        runId: randomUUID(),
        startedAt: new Date().toISOString(),
      });
      return end();
    }
    if (
      inbound.length > 30 ||
      inbound.reduce((total, message) => total + message.body.length, 0) > 32000
    ) {
      await tx("fail");
      await typing(sessionName, chatId, false);
      return end();
    }
    if (!inbound.length) {
      await tx("idle");
      if ((await tx("notify_claim")).ok && settings.notificationWhatsapp) {
        try {
          const credentials = await getWahaConfig();
          const sent = await sendWahaText(credentials, {
            session: sessionName,
            // Celular salvo com o 9 pode estar no WhatsApp sem ele.
            chatId: await resolveWahaChatId(
              credentials,
              sessionName,
              settings.notificationWhatsapp,
            ),
            text: buildQualifiedLeadNotification(conversation),
          });
          await tx("notify_result", { success: Boolean(wahaMessageId(sent)) });
        } catch (error) {
          console.warn("[ia] notificação não enviada", {
            message: error instanceof Error ? error.message : "erro desconhecido",
          });
          await tx("notify_result", { success: false });
        }
      }
      return end();
    }
    const quietFor =
      Date.now() -
      Date.parse(
        conversation.last_inbound_at ?? inbound[inbound.length - 1].criado_em,
      );
    if (quietFor < settings.debounceMs)
      return wait(sessionName, chatId, settings.debounceMs - quietFor);
    const hours = businessHours(settings.alwaysOn, settings.businessSchedule);
    const startedAt = new Date().toISOString();
    if (!hours.open) {
      await tx("commit", {
        messages: settings.businessSchedule.offHoursMessage
          ? [
              {
                body: offHoursReply(
                  settings.businessSchedule.offHoursMessage,
                  settings.knowledge,
                ),
                delayMs: 0,
              },
            ]
          : [],
        closedPeriod: hours.period,
        reason: "off_hours",
        runId: randomUUID(),
        startedAt,
      });
      return wait(sessionName, chatId, 500);
    }
    if (!(await tx("generating")).ok) return wait(sessionName, chatId, 500);
    if (settings.typingEnabled) await typing(sessionName, chatId, true);
    try {
      const content = await prepareTurnInput({
        sessionName,
        chatId,
        messages: inbound,
      });
      const result = await runConversationTurn({
        settings,
        conversation,
        ...content,
      });
      const delays = buildDelaysForMessages(result.messages, settings);
      const decision = result.decision;
      await tx("commit", {
        facts: decision.facts,
        unknown: decision.unknownFields,
        status: decision.status,
        human: decision.human,
        reason: decision.reason,
        // A mensagem final marca o encerramento quando for entregue.
        nextField:
          !decision.human && CLOSING_REASONS.has(decision.reason)
            ? ATTENDANCE_CLOSED
            : decision.nextField,
        changedFields: decision.changedFields,
        messages: result.messages.map((body, i) => ({
          body,
          delayMs: delays[i],
        })),
        model: result.model,
        latencyMs: Date.now() - Date.parse(startedAt),
        runId: randomUUID(),
        startedAt,
      });
      // A transição grava um motivo genérico; aqui fica o motivo real
      // (quitado, sem veículo, critério do perfil) para o painel.
      if (decision.disqualification) {
        try {
          await setDisqualificationReason(
            owner.clientId,
            conversation.id,
            DISQUALIFICATION_REASONS[decision.disqualification],
          );
        } catch {
          console.warn("[ia] disqualification_reason_unavailable");
        }
      }
    } catch {
      await tx("fail");
    } finally {
      await typing(sessionName, chatId, false);
    }
    return wait(sessionName, chatId, 300);
  } finally {
    await tx("release");
  }
}
