import "server-only";
import { EMPTY_KNOWLEDGE, DEFAULT_SCHEDULE } from "@/lib/ai-agent/config";

import { DEFAULT_AI_PROMPT } from "@/lib/ai-agent/prompt";
import {
  AI_AGENT_DEFAULTS,
  isAiLeadStatus,
  type AiAgentSettings,
  type AiConversationMessage,
  type AiConversationSummary,
  toAiAccessState,
  type AiAccessState,
  type ClientPlanType,
} from "@/lib/ai-agent/shared";
import {
  countConversations,
  ensureAiAgentSettings,
  getAiAgentSettings,
  getAiLiveFingerprint,
  getClientAiAccess,
  type ClientAiAccess,
  getSessionForClient,
  listConversationMessages,
  listConversations,
  findConversationById,
  mapConversation,
} from "@/lib/ai-agent/store";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { listBlockedNumbers, type AiBlockedNumber } from "@/lib/ai-agent/blocked";
import type { User } from "@/lib/types";

export type AiAgentPageData = {
  // Estado de acesso: a página decide o que mostrar só por aqui.
  access: AiAccessState;
  // Plano contratado de verdade (o acesso pode vir do interruptor do admin).
  plan: ClientPlanType;
  settings: AiAgentSettings;
  whatsappConnected: boolean;
  whatsappStatus: string | null;
  whatsappPhone: string | null;
  conversations: AiConversationSummary[];
  totals: { total: number; qualified: number };
  blockedNumbers: AiBlockedNumber[];
  // Mesma impressão digital da rota /api/ia/estado (null fora de "allowed").
  fingerprint: string | null;
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

function emptyData(
  access: AiAccessState,
  clientId: string,
  plan: ClientPlanType = "essential",
): AiAgentPageData {
  return {
    access,
    plan,
    settings: fallbackSettings(clientId),
    whatsappConnected: false,
    whatsappStatus: null,
    whatsappPhone: null,
    conversations: [],
    totals: { total: 0, qualified: 0 },
    blockedNumbers: [],
    fingerprint: null,
  };
}

export async function getAiAgentPageData(user: User): Promise<AiAgentPageData> {
  const clientId = user.clientId;

  if (!isSupabaseAdminConfigured()) {
    return emptyData("not_configured", clientId ?? "");
  }

  // Usuário de cliente sem empresa vinculada: problema de cadastro, não de
  // plano. Mostra como indisponível, nunca como "faça upgrade".
  if (!clientId) {
    return emptyData("not_configured", "");
  }

  let access: ClientAiAccess;
  try {
    access = await getClientAiAccess(clientId);
  } catch (error) {
    console.error("[ia/pagina] falha ao verificar acesso", {
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
    return emptyData("error", clientId);
  }

  const state = toAiAccessState(access.decision);

  try {
    if (state === "denied_segment") {
      return emptyData(state, clientId, access.plan);
    }

    if (state === "denied_plan") {
      // Prévia desfocada com a configuração salva (se já existir).
      const settings =
        (await getAiAgentSettings(clientId)) ?? fallbackSettings(clientId);
      return { ...emptyData(state, clientId, access.plan), settings };
    }

    // A linha de configuração nasce junto com o acesso. Nunca liga a IA.
    const settings = await ensureAiAgentSettings(clientId);

    const [session, conversations, totals, blockedNumbers, fingerprint] =
      await Promise.all([
        getSessionForClient(clientId),
        listConversations({ clientId, limit: 50 }),
        countConversations(clientId),
        listBlockedNumbers(clientId),
        getAiLiveFingerprint(clientId),
      ]);

    return {
      access: state,
      plan: access.plan,
      settings,
      whatsappConnected: session?.status === "WORKING",
      whatsappStatus: session?.status ?? null,
      whatsappPhone: session?.phoneNumber ?? null,
      conversations,
      totals,
      blockedNumbers,
      fingerprint,
    };
  } catch (error) {
    console.error("[ia/pagina] falha ao carregar", {
      message: error instanceof Error ? error.message : "erro desconhecido",
    });
    // Acesso confirmado, mas os dados não vieram: é erro, não bloqueio.
    return emptyData("error", clientId, access.plan);
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

  const access = await getClientAiAccess(clientId);

  if (!access.decision.allowed) {
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
