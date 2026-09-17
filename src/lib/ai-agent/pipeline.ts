import "server-only";

import { timingSafeEqual } from "node:crypto";
import {
  getWahaConfig,
  sendWahaText,
  setWahaTyping,
  wahaMessageId,
  WahaRequestError,
} from "@/lib/waha";
import {
  buildQualifiedLeadNotification,
  runConversationTurn,
} from "@/lib/ai-agent/engine";
import {
  fromWahaChatId,
  toWahaChatId,
  type AiAgentSettings,
} from "@/lib/ai-agent/shared";
import {
  AiAgentError,
  claimConversation,
  findConversation,
  findConversationById,
  getAiAgentSettings,
  getClientPlan,
  getNextOutboundMessage,
  getOrCreateConversation,
  getUnprocessedInbound,
  findSessionOwner,
  markInboundProcessed,
  recordInboundMessage,
  releaseConversation,
  updateConversation,
  updateMessageStatus,
  type ConversationRow,
} from "@/lib/ai-agent/store";

// ---------------------------------------------------------------------------
// Resposta que o fluxo do n8n entende
//
//   aguardar -> espere `esperarMs` e chame POST /whatsapp/ia/passo de novo
//   fim      -> nada mais a fazer nesta conversa
//   ignorar  -> evento descartado (fromMe, grupo, IA desligada, duplicado...)
// ---------------------------------------------------------------------------

export type PipelineResponse =
  | { acao: "aguardar"; esperarMs: number; sessionName: string; chatId: string }
  | { acao: "fim"; motivo?: string }
  | { acao: "ignorar"; motivo: string };

// ---------------------------------------------------------------------------
// Autenticação das rotas chamadas pelo n8n
// ---------------------------------------------------------------------------

function safeCompare(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * O n8n repassa o mesmo segredo que o WAHA já usa nos webhooks (o valor que o
 * admin salva em Configurações → WhatsApp). Assim não há credencial nova para
 * administrar e nenhum segredo trafega no corpo da requisição.
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

// ---------------------------------------------------------------------------
// Leitura do evento do WAHA
// ---------------------------------------------------------------------------

export type IncomingEvent = {
  sessionName: string;
  chatId: string;
  messageId: string | null;
  fromMe: boolean;
  body: string;
  pushName: string | null;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value : null;
}

/**
 * Aceita tanto o corpo cru do webhook do WAHA quanto uma versão já achatada
 * pelo n8n — o fluxo pode mudar sem quebrar a rota.
 */
export function parseIncomingEvent(body: unknown): IncomingEvent | null {
  const root = asRecord(body);
  const payload = asRecord(root.payload);
  const data = asRecord(payload._data ?? root._data);

  const sessionName =
    asText(root.session) ?? asText(root.sessionName) ?? asText(payload.session);
  const chatId =
    asText(payload.from) ?? asText(root.chatId) ?? asText(root.from);

  if (!sessionName || !chatId) {
    return null;
  }

  const fromMe =
    payload.fromMe === true || root.fromMe === true || data.fromMe === true;

  const body_ =
    asText(payload.body) ??
    asText(root.body) ??
    asText(payload.caption) ??
    "";

  const messageId =
    asText(payload.id) ?? asText(root.messageId) ?? asText(root.id);

  const pushName =
    asText(data.notifyName) ??
    asText(payload.notifyName) ??
    asText(root.notifyName) ??
    null;

  return {
    sessionName,
    chatId,
    messageId,
    fromMe,
    body: body_,
    pushName,
  };
}

// ---------------------------------------------------------------------------
// Contexto resolvido a partir da sessão
// ---------------------------------------------------------------------------

type AiContext = {
  clientId: string;
  sessionName: string;
  sessionPhone: string | null;
  settings: AiAgentSettings;
};

/**
 * Resolve o dono da sessão e verifica, no servidor, tudo que autoriza a IA a
 * responder: plano Completo, IA ligada e WhatsApp conectado. Qualquer "não"
 * aqui encerra o fluxo — não existe caminho pelo front que contorne isso.
 */
async function resolveContext(
  sessionName: string,
): Promise<AiContext | { blocked: string }> {
  const owner = await findSessionOwner(sessionName);

  if (!owner) {
    return { blocked: "Sessão não vinculada a nenhum cliente." };
  }

  const plan = await getClientPlan(owner.clientId);

  if (plan !== "complete") {
    return { blocked: "Cliente fora do Plano Completo." };
  }

  const settings = await getAiAgentSettings(owner.clientId);

  if (!settings || !settings.enabled) {
    return { blocked: "Atendimento por IA desativado." };
  }

  if (owner.status !== "WORKING") {
    return { blocked: "WhatsApp desconectado." };
  }

  return {
    clientId: owner.clientId,
    sessionName: owner.sessionName,
    sessionPhone: owner.phoneNumber,
    settings,
  };
}

// ---------------------------------------------------------------------------
// Entrada: registra a mensagem recebida
// ---------------------------------------------------------------------------

export async function ingestInboundEvent(
  event: IncomingEvent,
): Promise<PipelineResponse> {
  // Proteção contra loop: nada que o próprio WhatsApp conectado enviou volta
  // para a IA. Isso cobre as respostas da IA e o aviso de lead qualificado.
  if (event.fromMe) {
    return { acao: "ignorar", motivo: "Mensagem enviada pelo próprio número." };
  }

  const leadNumber = fromWahaChatId(event.chatId);

  if (!leadNumber) {
    return { acao: "ignorar", motivo: "Conversa não é um contato individual." };
  }

  const context = await resolveContext(event.sessionName);

  if ("blocked" in context) {
    return { acao: "ignorar", motivo: context.blocked };
  }

  if (context.sessionPhone && leadNumber === context.sessionPhone.replace(/\D/g, "")) {
    return { acao: "ignorar", motivo: "Mensagem do próprio número conectado." };
  }

  // O WhatsApp pessoal que recebe os avisos nunca é tratado como lead.
  if (
    context.settings.notificationWhatsapp &&
    leadNumber === context.settings.notificationWhatsapp
  ) {
    return { acao: "ignorar", motivo: "Número de notificação do cliente." };
  }

  if (!event.body.trim()) {
    return { acao: "ignorar", motivo: "Mensagem sem texto." };
  }

  const conversation = await getOrCreateConversation({
    clientId: context.clientId,
    whatsappNumber: leadNumber,
    chatId: event.chatId,
    name: event.pushName,
  });

  const isNew = await recordInboundMessage({
    conversationId: conversation.id,
    clientId: context.clientId,
    body: event.body.trim(),
    providerMessageId: event.messageId,
  });

  if (!isNew) {
    return { acao: "ignorar", motivo: "Evento repetido do webhook." };
  }

  await updateConversation(conversation.id, {
    last_inbound_at: new Date().toISOString(),
    name: conversation.name ?? event.pushName ?? null,
  });

  if (conversation.human_takeover) {
    // Histórico continua sendo gravado, mas a IA não responde.
    return { acao: "ignorar", motivo: "Conversa em atendimento humano." };
  }

  // Já existe um ciclo em andamento: ele vai encontrar esta mensagem sozinho.
  // Sem isso, cada mensagem do lead abriria um laço paralelo no n8n.
  const pendingOutbound = await getNextOutboundMessage(conversation.id);

  if (pendingOutbound) {
    return { acao: "ignorar", motivo: "Ciclo de resposta já em andamento." };
  }

  return {
    acao: "aguardar",
    esperarMs: context.settings.debounceMs,
    sessionName: context.sessionName,
    chatId: event.chatId,
  };
}

// ---------------------------------------------------------------------------
// Passo a passo do envio
// ---------------------------------------------------------------------------

function waitResponse(
  context: AiContext,
  chatId: string,
  esperarMs: number,
): PipelineResponse {
  return {
    acao: "aguardar",
    esperarMs: Math.max(0, Math.round(esperarMs)),
    sessionName: context.sessionName,
    chatId,
  };
}

export async function advanceConversation(input: {
  sessionName: string;
  chatId: string;
}): Promise<PipelineResponse> {
  const leadNumber = fromWahaChatId(input.chatId);

  if (!leadNumber) {
    return { acao: "ignorar", motivo: "Conversa não é um contato individual." };
  }

  const context = await resolveContext(input.sessionName);

  if ("blocked" in context) {
    return { acao: "fim", motivo: context.blocked };
  }

  const conversation = await findConversation(context.clientId, leadNumber);

  if (!conversation) {
    return { acao: "fim", motivo: "Conversa não encontrada." };
  }

  // Em atendimento humano o ciclo continua apenas para ENTREGAR o que já
  // foi gerado (inclusive o "vou passar para nossa equipe"). Gerar turno
  // novo é que fica bloqueado, mais abaixo. Descartar a fila é papel do
  // botão "Assumir atendimento", não deste caminho automático.

  // Só um ciclo mexe na conversa por vez.
  if (!(await claimConversation(conversation.id))) {
    return { acao: "fim", motivo: "Outro ciclo já está processando." };
  }

  try {
    return await advanceClaimedConversation(context, conversation, input.chatId);
  } finally {
    await releaseConversation(conversation.id);
  }
}

async function advanceClaimedConversation(
  context: AiContext,
  conversation: ConversationRow,
  chatId: string,
): Promise<PipelineResponse> {
  const waha = await getWahaConfig();

  // 1) Existe resposta na fila? Ela tem prioridade sobre gerar texto novo.
  const pending = await getNextOutboundMessage(conversation.id);

  if (pending) {
    if (pending.status === "queued") {
      if (context.settings.typingEnabled) {
        try {
          await setWahaTyping(waha, {
            session: context.sessionName,
            chatId,
            typing: true,
          });
        } catch {
          // "Digitando" é enfeite: se a API recusar, o delay continua valendo.
        }
      }

      await updateMessageStatus(pending.id, {
        status: "typing",
        typing_started_at: new Date().toISOString(),
      });

      return waitResponse(context, chatId, pending.delay_ms);
    }

    // status === "typing": só envia depois que o tempo sorteado realmente passou.
    const startedAt = pending.typing_started_at
      ? new Date(pending.typing_started_at).getTime()
      : 0;
    const remaining = startedAt + pending.delay_ms - Date.now();

    if (remaining > 250) {
      return waitResponse(context, chatId, remaining);
    }

    try {
      const sent = await sendWahaText(waha, {
        session: context.sessionName,
        chatId,
        text: pending.body,
      });

      await updateMessageStatus(pending.id, {
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: wahaMessageId(sent),
      });
      await updateConversation(conversation.id, {
        last_outbound_at: new Date().toISOString(),
        last_error: null,
      });
    } catch (error) {
      const message =
        error instanceof WahaRequestError
          ? error.message
          : "Falha ao enviar a mensagem pelo WhatsApp.";

      await updateMessageStatus(pending.id, { status: "failed" });
      await updateConversation(conversation.id, { last_error: message });
      console.error("[ia/passo] falha ao enviar", { message });

      return { acao: "fim", motivo: "Falha no envio." };
    }

    const next = await getNextOutboundMessage(conversation.id);

    if (next) {
      return waitResponse(context, chatId, 0);
    }

    await maybeNotifyQualifiedLead(context, conversation.id, waha);
    return { acao: "fim" };
  }

  // 2) Fila vazia: há mensagens do lead esperando resposta?
  if (conversation.human_takeover) {
    await maybeNotifyQualifiedLead(context, conversation.id, waha);
    return { acao: "fim", motivo: "Conversa em atendimento humano." };
  }

  const inbound = await getUnprocessedInbound(conversation.id);

  if (inbound.length === 0) {
    await maybeNotifyQualifiedLead(context, conversation.id, waha);
    return { acao: "fim" };
  }

  // Debounce: agrupa mensagens em rajada. Enquanto o lead estiver digitando
  // seguidamente, a IA espera em vez de responder quatro vezes.
  const lastAt = new Date(inbound[inbound.length - 1].criado_em).getTime();
  const quietFor = Date.now() - lastAt;

  if (quietFor < context.settings.debounceMs) {
    return waitResponse(context, chatId, context.settings.debounceMs - quietFor);
  }

  const grouped = inbound.map((item) => item.body).join("\n");
  const inboundIds = inbound.map((item) => item.id);

  try {
    const result = await runConversationTurn({
      settings: context.settings,
      conversation,
      incomingText: grouped,
    });

    // Marcado depois do turno: antes dele essas mensagens precisam ficar
    // fora do histórico, senão chegariam duplicadas ao modelo.
    await markInboundProcessed(inboundIds);

    if (result.kind === "skipped") {
      return { acao: "fim", motivo: result.reason };
    }

    if (result.decision.status === "human_takeover") {
      await updateConversation(conversation.id, { human_takeover: true });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao gerar a resposta.";

    // Não vaza erro técnico para o lead: registra e encerra o ciclo. A próxima
    // mensagem dele tenta de novo.
    await markInboundProcessed(inboundIds);
    await updateConversation(conversation.id, { last_error: message });
    console.error("[ia/passo] falha na geração", { message });

    return { acao: "fim", motivo: "Falha ao gerar a resposta." };
  }

  // Encaminha imediatamente para o primeiro passo de envio.
  return waitResponse(context, chatId, 0);
}

// ---------------------------------------------------------------------------
// Aviso de lead qualificado
// ---------------------------------------------------------------------------

async function maybeNotifyQualifiedLead(
  context: AiContext,
  conversationId: string,
  waha: Awaited<ReturnType<typeof getWahaConfig>>,
) {
  if (!context.settings.notifyQualified || !context.settings.notificationWhatsapp) {
    return;
  }

  const conversation = await findConversationById(context.clientId, conversationId);

  if (
    !conversation ||
    conversation.status !== "qualified" ||
    conversation.notification_sent
  ) {
    return;
  }

  // Marca antes de enviar: se o envio falhar, o lead nao vira uma rajada de
  // avisos repetidos — o cliente ve o lead no painel de qualquer forma.
  await updateConversation(conversation.id, {
    notification_sent: true,
    notification_sent_at: new Date().toISOString(),
  });

  try {
    await sendWahaText(waha, {
      session: context.sessionName,
      chatId: toWahaChatId(context.settings.notificationWhatsapp),
      text: buildQualifiedLeadNotification(conversation),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao enviar a notificacao.";
    await updateConversation(conversation.id, { last_error: message });
    console.error("[ia/notificacao] falha", { message });
  }
}
