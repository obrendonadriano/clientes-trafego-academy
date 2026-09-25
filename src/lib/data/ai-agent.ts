import "server-only";
import { EMPTY_KNOWLEDGE, DEFAULT_SCHEDULE } from "@/lib/ai-agent/config";

import { DEFAULT_AI_PROMPT } from "@/lib/ai-agent/prompt";
import {
  AI_AGENT_DEFAULTS,
  isAiLeadStatus,
  type AiAgentSettings,
  type AiConversationMessage,
  type AiConversationSummary,
  type ClientPlanType,
} from "@/lib/ai-agent/shared";
import {
  countConversations,
  ensureAiAgentSettings,
  getAiAgentSettings,
  getClientPlan,
  getSessionForClient,
  listConversationMessages,
  listConversations,
  findConversationById,
  mapConversation,
} from "@/lib/ai-agent/store";
import { isSupabaseAdminConfigured } from "@/lib/env";
import type { User } from "@/lib/types";

export type AiAgentPageData = {
  plan: ClientPlanType;
  settings: AiAgentSettings;
  whatsappConnected: boolean;
  whatsappStatus: string | null;
  whatsappPhone: string | null;
  conversations: AiConversationSummary[];
  totals: { total: number; qualified: number };
  // Quando true, o banco ainda não tem a estrutura da IA (migração pendente).
  unavailable?: boolean;
};

function fallbackSettings(clientId: string): AiAgentSettings {
  return {
    clientId,
    enabled: false,
    prompt: DEFAULT_AI_PROMPT,
    notificationWhatsapp: null,
    alwaysOn: AI_AGENT_DEFAULTS.alwaysOn,
    typingEnabled: AI_AGENT_DEFAULTS.typingEnabled,
    notifyQualified: AI_AGENT_DEFAULTS.notifyQualified,
    delayMinMs: AI_AGENT_DEFAULTS.delayMinMs,
    delayMaxMs: AI_AGENT_DEFAULTS.delayMaxMs,
    messageGapMinMs: AI_AGENT_DEFAULTS.messageGapMinMs,
    messageGapMaxMs: AI_AGENT_DEFAULTS.messageGapMaxMs,
    debounceMs: AI_AGENT_DEFAULTS.debounceMs,
    timezone: AI_AGENT_DEFAULTS.timezone,
    disabledByPlanAt: null,
    knowledge: EMPTY_KNOWLEDGE,
    businessSchedule: DEFAULT_SCHEDULE,
  };
}

export async function getAiAgentPageData(user: User): Promise<AiAgentPageData> {
  const clientId = user.clientId;

  if (!clientId || !isSupabaseAdminConfigured()) {
    return {
      plan: "essential",
      settings: fallbackSettings(clientId ?? ""),
      whatsappConnected: false,
      whatsappStatus: null,
      whatsappPhone: null,
      conversations: [],
      totals: { total: 0, qualified: 0 },
      unavailable: !isSupabaseAdminConfigured(),
    };
  }

  try {
    const plan = await getClientPlan(clientId);

    // O prompt padrão nasce junto com o acesso ao Plano Completo. Cliente
    // Essencial não ganha linha de configuração até fazer o upgrade.
    const settings =
      plan === "complete"
        ? await ensureAiAgentSettings(clientId)
        : ((await getAiAgentSettings(clientId)) ?? fallbackSettings(clientId));

    const [session, conversations, totals] = await Promise.all([
      getSessionForClient(clientId),
      plan === "complete"
        ? listConversations({ clientId, limit: 50 })
        : Promise.resolve([] as AiConversationSummary[]),
      plan === "complete"
        ? countConversations(clientId)
        : Promise.resolve({ total: 0, qualified: 0 }),
    ]);

    return {
      plan,
      settings,
      whatsappConnected: session?.status === "WORKING",
      whatsappStatus: session?.status ?? null,
      whatsappPhone: session?.phoneNumber ?? null,
      conversations,
      totals,
    };
  } catch (error) {
    console.error("[ia/pagina] falha ao carregar", {
      message: error instanceof Error ? error.message : "erro desconhecido",
    });

    return {
      plan: "essential",
      settings: fallbackSettings(clientId),
      whatsappConnected: false,
      whatsappStatus: null,
      whatsappPhone: null,
      conversations: [],
      totals: { total: 0, qualified: 0 },
      unavailable: true,
    };
  }
}

export type AiConversationDetail = {
  conversation: AiConversationSummary;
  messages: AiConversationMessage[];
};

/**
 * Detalhe de uma conversa. O `clientId` entra na consulta, não só na
 * checagem: um id de conversa de outro cliente simplesmente não existe aqui.
 */
export async function getAiConversationDetail(
  user: User,
  conversationId: string,
): Promise<AiConversationDetail | null> {
  const clientId = user.clientId;

  if (!clientId || !isSupabaseAdminConfigured()) {
    return null;
  }

  const plan = await getClientPlan(clientId);

  if (plan !== "complete") {
    return null;
  }

  const row = await findConversationById(clientId, conversationId);

  if (!row) {
    return null;
  }

  const messages = await listConversationMessages(row.id);

  return { conversation: mapConversation(row), messages };
}

export function parseStatusFilter(value: unknown) {
  return isAiLeadStatus(value) ? value : null;
}
