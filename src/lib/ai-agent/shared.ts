import type { AiKnowledge, AiSchedule } from "./config";
// Tipos e regras do atendimento por IA que rodam nos dois lados (servidor e
// navegador). Nada aqui pode importar "server-only" nem tocar no Supabase.

export const CLIENT_PLAN_TYPES = ["essential", "complete"] as const;
export type ClientPlanType = (typeof CLIENT_PLAN_TYPES)[number];

export const CLIENT_PLAN_LABELS: Record<ClientPlanType, string> = {
  essential: "Essencial",
  complete: "Completo",
};

export function isClientPlanType(value: unknown): value is ClientPlanType {
  return (
    typeof value === "string" &&
    CLIENT_PLAN_TYPES.some((plan) => plan === value)
  );
}

export function toClientPlanType(value: unknown): ClientPlanType {
  return isClientPlanType(value) ? value : "essential";
}

export const AI_LEAD_STATUSES = [
  "new",
  "qualifying",
  "qualified",
  "disqualified",
  "human_takeover",
  "completed",
  "error",
] as const;

export type AiLeadStatus = (typeof AI_LEAD_STATUSES)[number];

export const AI_LEAD_STATUS_LABELS: Record<AiLeadStatus, string> = {
  new: "Novo",
  qualifying: "Em qualificação",
  qualified: "Qualificado",
  disqualified: "Desqualificado",
  human_takeover: "Atendimento humano",
  completed: "Concluído",
  error: "Com erro",
};

export function isAiLeadStatus(value: unknown): value is AiLeadStatus {
  return (
    typeof value === "string" && AI_LEAD_STATUSES.some((item) => item === value)
  );
}

export type AiMessageDirection = "inbound" | "outbound";

export type AiAgentSettings = {
  clientId: string;
  enabled: boolean;
  prompt: string;
  notificationWhatsapp: string | null;
  alwaysOn: boolean;
  typingEnabled: boolean;
  notifyQualified: boolean;
  delayMinMs: number;
  delayMaxMs: number;
  messageGapMinMs: number;
  messageGapMaxMs: number;
  debounceMs: number;
  timezone: string;
  disabledByPlanAt: string | null;
  knowledge: AiKnowledge;
  businessSchedule: AiSchedule;
};

export type AiConversationSummary = {
  id: string;
  whatsappNumber: string;
  name: string | null;
  status: AiLeadStatus;
  vehicle: string | null;
  vehicleYear: number | null;
  financed: boolean | null;
  bank: string | null;
  debtAmount: number | null;
  hasOverdueInstallments: boolean | null;
  overdueInstallmentsCount: number | null;
  unknownFields: string[];
  disqualificationReason: string | null;
  qualifiedAt: string | null;
  notificationSent: boolean;
  humanTakeover: boolean;
  humanTakeoverRequested: boolean;
  lastInboundAt: string | null;
  createdAt: string;
  updatedAt: string;
  processingState: string;
  lastError: string | null;
  whatsappDisplayName: string | null;
};

export type AiConversationMessage = {
  id: string;
  direction: AiMessageDirection;
  body: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  senderType: "lead" | "ai" | "human";
};

// Valores padrão exigidos pela especificação: IA desligada, atendimento 24h,
// "digitando" ligado e notificação ligada.
export const AI_AGENT_DEFAULTS = {
  enabled: false,
  alwaysOn: true,
  typingEnabled: true,
  notifyQualified: true,
  delayMinMs: 1500,
  delayMaxMs: 4000,
  messageGapMinMs: 800,
  messageGapMaxMs: 2200,
  debounceMs: 3000,
  timezone: "America/Sao_Paulo",
} as const;

// Limites aceitos nas configurações avançadas (nada negativo ou absurdo).
export const AI_AGENT_LIMITS = {
  delayMinMs: { min: 0, max: 30_000 },
  delayMaxMs: { min: 0, max: 60_000 },
  messageGapMinMs: { min: 0, max: 30_000 },
  messageGapMaxMs: { min: 0, max: 60_000 },
  debounceMs: { min: 0, max: 30_000 },
} as const;

// ---------------------------------------------------------------------------
// Telefone brasileiro
// ---------------------------------------------------------------------------

// DDDs realmente em uso no Brasil (Anatel). Serve para recusar "(00) ..." e
// afins antes de gravar um número que nunca receberia a notificação.
const VALID_AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type PhoneNormalizationResult =
  { ok: true; value: string } | { ok: false; error: string };

const INVALID_PHONE_MESSAGE =
  "Número de WhatsApp inválido. Verifique o DDD e o telefone informado.";

/**
 * Normaliza um telefone brasileiro para o formato usado internamente:
 * `55` + DDD + número, somente dígitos.
 *
 * Aceita "14999999999", "(14) 99999-9999", "14 99999-9999", "5514999999999"
 * e "+5514999999999" — e nunca duplica o 55 que já veio.
 */
export function normalizeBrazilianWhatsapp(
  raw: string | null | undefined,
): PhoneNormalizationResult {
  const digits = String(raw ?? "").replace(/\D/g, "");

  if (!digits) {
    return { ok: false, error: INVALID_PHONE_MESSAGE };
  }

  let local = digits;

  // Só remove o 55 da frente quando o que sobra tem cara de telefone nacional
  // (10 ou 11 dígitos). Assim "5511999999999" vira "11999999999", mas um
  // número que legitimamente começa com 55 (DDD 55, Santa Maria/RS) é mantido.
  if (local.startsWith("55") && (local.length === 12 || local.length === 13)) {
    local = local.slice(2);
  }

  if (local.length !== 10 && local.length !== 11) {
    return { ok: false, error: INVALID_PHONE_MESSAGE };
  }

  const areaCode = Number(local.slice(0, 2));

  if (!VALID_AREA_CODES.has(areaCode)) {
    return { ok: false, error: INVALID_PHONE_MESSAGE };
  }

  const subscriber = local.slice(2);

  // Celular com 9 dígitos precisa começar com 9; fixo com 8 começa em 2–5.
  if (subscriber.length === 9 && !subscriber.startsWith("9")) {
    return { ok: false, error: INVALID_PHONE_MESSAGE };
  }

  if (subscriber.length === 8 && !/^[2-5]/.test(subscriber)) {
    return { ok: false, error: INVALID_PHONE_MESSAGE };
  }

  return { ok: true, value: `55${local}` };
}

/** Formata para exibição: "5514999999999" -> "(14) 99999-9999". */
export function formatBrazilianWhatsapp(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const digits = value.replace(/\D/g, "");
  const local =
    digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;

  if (local.length === 11) {
    return local.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }

  if (local.length === 10) {
    return local.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }

  return value;
}

/** Converte um número normalizado no chatId que o WAHA espera. */
export function toWahaChatId(normalizedNumber: string) {
  return `${normalizedNumber.replace(/\D/g, "")}@c.us`;
}

/** Extrai o número de um chatId do WAHA, ignorando grupos e canais. */
export function fromWahaChatId(chatId: string | null | undefined) {
  const value = String(chatId ?? "");

  // Grupos (@g.us), status e newsletters nunca viram lead.
  if (!value.endsWith("@c.us")) {
    return null;
  }

  const digits = value.replace(/@.*$/, "").replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

// ---------------------------------------------------------------------------
// Saudação por horário local do cliente
// ---------------------------------------------------------------------------

export function greetingForTimezone(
  timezone: string,
  now: Date = new Date(),
): "Bom dia" | "Boa tarde" | "Boa noite" {
  let hour: number;

  try {
    hour = Number(
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }).format(now),
    );
  } catch {
    hour = now.getHours();
  }

  if (!Number.isFinite(hour)) {
    hour = now.getHours();
  }

  if (hour < 12) {
    return "Bom dia";
  }

  return hour < 18 ? "Boa tarde" : "Boa noite";
}
