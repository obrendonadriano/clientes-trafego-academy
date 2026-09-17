import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AI_PROMPT } from "@/lib/ai-agent/prompt";
import {
  AI_AGENT_DEFAULTS,
  isAiLeadStatus,
  toClientPlanType,
  type AiAgentSettings,
  type AiConversationMessage,
  type AiConversationSummary,
  type AiLeadStatus,
  type ClientPlanType,
} from "@/lib/ai-agent/shared";

export class AiAgentError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AiAgentError";
    this.status = status;
  }
}

export function aiAdminClient() {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new AiAgentError(
      "A conexão segura com o banco não está configurada.",
      503,
    );
  }

  return adminClient;
}

const SETTINGS_COLUMNS =
  "client_id, enabled, prompt, notification_whatsapp, always_on, typing_enabled, notify_qualified, delay_min_ms, delay_max_ms, message_gap_min_ms, message_gap_max_ms, debounce_ms, timezone, disabled_by_plan_at";

const CONVERSATION_COLUMNS =
  "id, client_id, whatsapp_number, chat_id, name, status, vehicle, vehicle_year, financed, bank, debt_amount, has_overdue_installments, overdue_installments_count, unknown_fields, extra_data, disqualification_reason, qualified_at, notification_sent, notification_sent_at, human_takeover, human_takeover_requested, last_inbound_at, last_outbound_at, last_error, criado_em, atualizado_em";

type SettingsRow = {
  client_id: string;
  enabled: boolean;
  prompt: string | null;
  notification_whatsapp: string | null;
  always_on: boolean;
  typing_enabled: boolean;
  notify_qualified: boolean;
  delay_min_ms: number;
  delay_max_ms: number;
  message_gap_min_ms: number;
  message_gap_max_ms: number;
  debounce_ms: number;
  timezone: string | null;
  disabled_by_plan_at: string | null;
};

export type ConversationRow = {
  id: string;
  client_id: string;
  whatsapp_number: string;
  chat_id: string;
  name: string | null;
  status: string;
  vehicle: string | null;
  vehicle_year: number | null;
  financed: boolean | null;
  bank: string | null;
  debt_amount: number | string | null;
  has_overdue_installments: boolean | null;
  overdue_installments_count: number | null;
  unknown_fields: string[] | null;
  extra_data: Record<string, unknown> | null;
  disqualification_reason: string | null;
  qualified_at: string | null;
  notification_sent: boolean;
  notification_sent_at: string | null;
  human_takeover: boolean;
  human_takeover_requested: boolean;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_error: string | null;
  criado_em: string;
  atualizado_em: string;
};

function mapSettings(row: SettingsRow): AiAgentSettings {
  return {
    clientId: row.client_id,
    enabled: row.enabled,
    prompt: row.prompt?.trim() ? row.prompt : DEFAULT_AI_PROMPT,
    notificationWhatsapp: row.notification_whatsapp,
    alwaysOn: row.always_on,
    typingEnabled: row.typing_enabled,
    notifyQualified: row.notify_qualified,
    delayMinMs: row.delay_min_ms,
    delayMaxMs: row.delay_max_ms,
    messageGapMinMs: row.message_gap_min_ms,
    messageGapMaxMs: row.message_gap_max_ms,
    debounceMs: row.debounce_ms,
    timezone: row.timezone || AI_AGENT_DEFAULTS.timezone,
    disabledByPlanAt: row.disabled_by_plan_at,
  };
}

export function mapConversation(row: ConversationRow): AiConversationSummary {
  return {
    id: row.id,
    whatsappNumber: row.whatsapp_number,
    name: row.name,
    status: isAiLeadStatus(row.status) ? row.status : "error",
    vehicle: row.vehicle,
    vehicleYear: row.vehicle_year,
    financed: row.financed,
    bank: row.bank,
    debtAmount: row.debt_amount === null ? null : Number(row.debt_amount),
    hasOverdueInstallments: row.has_overdue_installments,
    overdueInstallmentsCount: row.overdue_installments_count,
    unknownFields: row.unknown_fields ?? [],
    disqualificationReason: row.disqualification_reason,
    qualifiedAt: row.qualified_at,
    notificationSent: row.notification_sent,
    humanTakeover: row.human_takeover,
    humanTakeoverRequested: row.human_takeover_requested,
    lastInboundAt: row.last_inbound_at,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em,
  };
}

// ---------------------------------------------------------------------------
// Cliente e plano
// ---------------------------------------------------------------------------

export async function getClientPlan(clientId: string): Promise<ClientPlanType> {
  const { data, error } = await aiAdminClient()
    .from("clients")
    .select("plan_type")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    throw new AiAgentError("Não foi possível verificar o plano do cliente.");
  }

  return toClientPlanType((data as { plan_type?: unknown } | null)?.plan_type);
}

export async function getClientCompanyName(clientId: string) {
  const { data } = await aiAdminClient()
    .from("clients")
    .select("nome_empresa")
    .eq("id", clientId)
    .maybeSingle();

  return (data as { nome_empresa?: string } | null)?.nome_empresa ?? null;
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export async function getAiAgentSettings(clientId: string) {
  const { data, error } = await aiAdminClient()
    .from("ai_agent_settings")
    .select(SETTINGS_COLUMNS)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new AiAgentError("Não foi possível carregar a configuração da IA.");
  }

  return data ? mapSettings(data as SettingsRow) : null;
}

/**
 * Garante a linha de configuração do cliente, já com o prompt padrão.
 * Nunca liga a IA por conta própria — `enabled` continua falso.
 */
export async function ensureAiAgentSettings(clientId: string) {
  const current = await getAiAgentSettings(clientId);

  if (current) {
    return current;
  }

  const { error } = await aiAdminClient()
    .from("ai_agent_settings")
    .insert({
      client_id: clientId,
      enabled: false,
      prompt: DEFAULT_AI_PROMPT,
      always_on: AI_AGENT_DEFAULTS.alwaysOn,
      typing_enabled: AI_AGENT_DEFAULTS.typingEnabled,
      notify_qualified: AI_AGENT_DEFAULTS.notifyQualified,
      delay_min_ms: AI_AGENT_DEFAULTS.delayMinMs,
      delay_max_ms: AI_AGENT_DEFAULTS.delayMaxMs,
      message_gap_min_ms: AI_AGENT_DEFAULTS.messageGapMinMs,
      message_gap_max_ms: AI_AGENT_DEFAULTS.messageGapMaxMs,
      debounce_ms: AI_AGENT_DEFAULTS.debounceMs,
      timezone: AI_AGENT_DEFAULTS.timezone,
    });

  // 23505: outra requisição criou a mesma linha no meio do caminho.
  if (error && error.code !== "23505") {
    throw new AiAgentError("Não foi possível preparar a configuração da IA.");
  }

  const saved = await getAiAgentSettings(clientId);

  if (!saved) {
    throw new AiAgentError("Não foi possível preparar a configuração da IA.");
  }

  return saved;
}

export type AiAgentSettingsPatch = Partial<{
  enabled: boolean;
  prompt: string;
  notification_whatsapp: string | null;
  always_on: boolean;
  typing_enabled: boolean;
  notify_qualified: boolean;
  delay_min_ms: number;
  delay_max_ms: number;
  message_gap_min_ms: number;
  message_gap_max_ms: number;
  debounce_ms: number;
  timezone: string;
  disabled_by_plan_at: string | null;
}>;

export async function updateAiAgentSettings(
  clientId: string,
  patch: AiAgentSettingsPatch,
) {
  const { error } = await aiAdminClient()
    .from("ai_agent_settings")
    .update(patch)
    .eq("client_id", clientId);

  if (error) {
    // A trava de plano no banco chega aqui como erro de permissão.
    if (error.code === "42501") {
      throw new AiAgentError(
        "O atendimento por IA é exclusivo do Plano Completo.",
        403,
      );
    }

    if (error.code === "23514") {
      throw new AiAgentError(
        "Alguma configuração está fora dos limites permitidos.",
        400,
      );
    }

    throw new AiAgentError("Não foi possível salvar a configuração da IA.");
  }
}

// ---------------------------------------------------------------------------
// Sessão do WhatsApp (reaproveita a tabela que já existe)
// ---------------------------------------------------------------------------

export type AiSessionOwner = {
  clientId: string;
  sessionName: string;
  status: string | null;
  phoneNumber: string | null;
};

export async function findSessionOwner(sessionName: string) {
  const { data, error } = await aiAdminClient()
    .from("whatsapp_sessions")
    .select("client_id, session_name, status, phone_number")
    .eq("session_name", sessionName)
    .maybeSingle();

  if (error) {
    throw new AiAgentError("Não foi possível localizar a sessão do WhatsApp.");
  }

  if (!data) {
    return null;
  }

  const row = data as {
    client_id: string;
    session_name: string;
    status: string | null;
    phone_number: string | null;
  };

  return {
    clientId: row.client_id,
    sessionName: row.session_name,
    status: row.status,
    phoneNumber: row.phone_number,
  } satisfies AiSessionOwner;
}

export async function getSessionForClient(clientId: string) {
  const { data, error } = await aiAdminClient()
    .from("whatsapp_sessions")
    .select("client_id, session_name, status, phone_number")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new AiAgentError("Não foi possível consultar a conexão do WhatsApp.");
  }

  if (!data?.session_name) {
    return null;
  }

  const row = data as {
    client_id: string;
    session_name: string;
    status: string | null;
    phone_number: string | null;
  };

  return {
    clientId: row.client_id,
    sessionName: row.session_name,
    status: row.status,
    phoneNumber: row.phone_number,
  } satisfies AiSessionOwner;
}

// ---------------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------------

export async function findConversation(clientId: string, whatsappNumber: string) {
  const { data, error } = await aiAdminClient()
    .from("ai_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("client_id", clientId)
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  if (error) {
    throw new AiAgentError("Não foi possível carregar a conversa.");
  }

  return (data as ConversationRow | null) ?? null;
}

export async function findConversationById(
  clientId: string,
  conversationId: string,
) {
  const { data, error } = await aiAdminClient()
    .from("ai_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("client_id", clientId)
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    throw new AiAgentError("Não foi possível carregar a conversa.");
  }

  return (data as ConversationRow | null) ?? null;
}

export async function getOrCreateConversation(input: {
  clientId: string;
  whatsappNumber: string;
  chatId: string;
  name?: string | null;
}) {
  const existing = await findConversation(input.clientId, input.whatsappNumber);

  if (existing) {
    return existing;
  }

  const { error } = await aiAdminClient().from("ai_conversations").insert({
    client_id: input.clientId,
    whatsapp_number: input.whatsappNumber,
    chat_id: input.chatId,
    name: input.name?.trim() || null,
    status: "new",
  });

  if (error && error.code !== "23505") {
    throw new AiAgentError("Não foi possível abrir a conversa do lead.");
  }

  const created = await findConversation(input.clientId, input.whatsappNumber);

  if (!created) {
    throw new AiAgentError("Não foi possível abrir a conversa do lead.");
  }

  return created;
}

export type ConversationPatch = Partial<{
  name: string | null;
  status: AiLeadStatus;
  vehicle: string | null;
  vehicle_year: number | null;
  financed: boolean | null;
  bank: string | null;
  debt_amount: number | null;
  has_overdue_installments: boolean | null;
  overdue_installments_count: number | null;
  unknown_fields: string[];
  extra_data: Record<string, unknown>;
  disqualification_reason: string | null;
  qualified_at: string | null;
  notification_sent: boolean;
  notification_sent_at: string | null;
  human_takeover: boolean;
  human_takeover_requested: boolean;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  processing_claimed_at: string | null;
  last_error: string | null;
}>;

export async function updateConversation(
  conversationId: string,
  patch: ConversationPatch,
) {
  const { error } = await aiAdminClient()
    .from("ai_conversations")
    .update(patch)
    .eq("id", conversationId);

  if (error) {
    throw new AiAgentError("Não foi possível atualizar a conversa.");
  }
}

/** Reserva a conversa. Retorna false quando outra execução já está rodando. */
export async function claimConversation(conversationId: string) {
  const { data, error } = await aiAdminClient().rpc("ai_claim_conversation", {
    p_conversation_id: conversationId,
  });

  if (error) {
    throw new AiAgentError("Não foi possível reservar a conversa.");
  }

  return data === true;
}

export async function releaseConversation(conversationId: string) {
  await aiAdminClient()
    .from("ai_conversations")
    .update({ processing_claimed_at: null })
    .eq("id", conversationId);
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

export type MessageRow = {
  id: string;
  conversation_id: string;
  client_id: string;
  direction: "inbound" | "outbound";
  status: string;
  body: string;
  provider_message_id: string | null;
  run_id: string | null;
  sequence: number;
  delay_ms: number;
  typing_started_at: string | null;
  sent_at: string | null;
  criado_em: string;
};

const MESSAGE_COLUMNS =
  "id, conversation_id, client_id, direction, status, body, provider_message_id, run_id, sequence, delay_ms, typing_started_at, sent_at, criado_em";

/**
 * Grava a mensagem recebida. Retorna `false` quando o mesmo id já existia —
 * é o que torna o webhook idempotente contra entregas repetidas.
 */
export async function recordInboundMessage(input: {
  conversationId: string;
  clientId: string;
  body: string;
  providerMessageId: string | null;
}) {
  const { error } = await aiAdminClient().from("ai_messages").insert({
    conversation_id: input.conversationId,
    client_id: input.clientId,
    direction: "inbound",
    status: "received",
    body: input.body,
    provider_message_id: input.providerMessageId,
  });

  if (error) {
    if (error.code === "23505") {
      return false;
    }

    throw new AiAgentError("Não foi possível registrar a mensagem recebida.");
  }

  return true;
}

export async function getUnprocessedInbound(conversationId: string) {
  const { data, error } = await aiAdminClient()
    .from("ai_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .eq("status", "received")
    .order("criado_em", { ascending: true })
    .limit(30);

  if (error) {
    throw new AiAgentError("Não foi possível ler as mensagens pendentes.");
  }

  return (data as MessageRow[] | null) ?? [];
}

export async function markInboundProcessed(messageIds: string[]) {
  if (messageIds.length === 0) {
    return;
  }

  await aiAdminClient()
    .from("ai_messages")
    .update({ status: "processed" })
    .in("id", messageIds);
}

export async function markInboundIgnored(messageIds: string[]) {
  if (messageIds.length === 0) {
    return;
  }

  await aiAdminClient()
    .from("ai_messages")
    .update({ status: "ignored" })
    .in("id", messageIds);
}

/**
 * Histórico recente para dar contexto ao modelo, em ordem cronológica.
 *
 * Só entra o que já foi tratado: as mensagens do lote atual ainda estão em
 * "received" e vão para o modelo separadamente, como a fala nova do lead.
 * Sem esse corte, a mensagem apareceria duas vezes no prompt.
 */
export async function getRecentMessages(conversationId: string, limit = 20) {
  const { data, error } = await aiAdminClient()
    .from("ai_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .in("status", ["processed", "sent"])
    .order("criado_em", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AiAgentError("Não foi possível carregar o histórico da conversa.");
  }

  return ((data as MessageRow[] | null) ?? []).reverse();
}

export async function queueOutboundMessages(input: {
  conversationId: string;
  clientId: string;
  runId: string;
  messages: { body: string; delayMs: number }[];
}) {
  if (input.messages.length === 0) {
    return;
  }

  const { error } = await aiAdminClient()
    .from("ai_messages")
    .insert(
      input.messages.map((message, index) => ({
        conversation_id: input.conversationId,
        client_id: input.clientId,
        direction: "outbound",
        status: "queued",
        body: message.body,
        run_id: input.runId,
        sequence: index,
        delay_ms: message.delayMs,
      })),
    );

  if (error) {
    throw new AiAgentError("Não foi possível enfileirar a resposta da IA.");
  }
}

/** Próxima mensagem a tratar na fila de saída (aguardando ou digitando). */
export async function getNextOutboundMessage(conversationId: string) {
  const { data, error } = await aiAdminClient()
    .from("ai_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .in("status", ["queued", "typing"])
    .order("criado_em", { ascending: true })
    .order("sequence", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AiAgentError("Não foi possível ler a fila de envio.");
  }

  return (data as MessageRow | null) ?? null;
}

export async function updateMessageStatus(
  messageId: string,
  patch: Partial<{
    status: string;
    provider_message_id: string | null;
    typing_started_at: string | null;
    sent_at: string | null;
  }>,
) {
  await aiAdminClient().from("ai_messages").update(patch).eq("id", messageId);
}

/** Descarta a fila pendente — usado quando o humano assume a conversa. */
export async function discardQueuedMessages(conversationId: string) {
  await aiAdminClient()
    .from("ai_messages")
    .update({ status: "failed" })
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .in("status", ["queued", "typing"]);
}

// ---------------------------------------------------------------------------
// Leituras para o painel
// ---------------------------------------------------------------------------

export async function listConversations(input: {
  clientId: string;
  status?: AiLeadStatus | null;
  limit?: number;
}) {
  let query = aiAdminClient()
    .from("ai_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("client_id", input.clientId)
    .order("atualizado_em", { ascending: false })
    .limit(Math.min(input.limit ?? 50, 200));

  if (input.status) {
    query = query.eq("status", input.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new AiAgentError("Não foi possível carregar os leads da IA.");
  }

  return ((data as ConversationRow[] | null) ?? []).map(mapConversation);
}

export async function listConversationMessages(
  conversationId: string,
  limit = 200,
): Promise<AiConversationMessage[]> {
  const { data, error } = await aiAdminClient()
    .from("ai_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("criado_em", { ascending: true })
    .limit(limit);

  if (error) {
    throw new AiAgentError("Não foi possível carregar o histórico.");
  }

  return ((data as MessageRow[] | null) ?? [])
    .filter((row) => row.status !== "failed" && row.status !== "ignored")
    .map((row) => ({
      id: row.id,
      direction: row.direction,
      body: row.body,
      status: row.status,
      createdAt: row.criado_em,
      sentAt: row.sent_at,
    }));
}

export async function countConversations(clientId: string) {
  const admin = aiAdminClient();

  const [total, qualified] = await Promise.all([
    admin
      .from("ai_conversations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId),
    admin
      .from("ai_conversations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("status", "qualified"),
  ]);

  return {
    total: total.count ?? 0,
    qualified: qualified.count ?? 0,
  };
}
