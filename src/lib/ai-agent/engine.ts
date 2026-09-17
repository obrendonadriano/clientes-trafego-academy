import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateDeepseekJson, type DeepseekMessage } from "@/lib/services/deepseek";
import {
  buildDelaysForMessages,
  splitReplyIntoMessages,
} from "@/lib/ai-agent/humanize";
import {
  formatBrazilianWhatsapp,
  greetingForTimezone,
  type AiAgentSettings,
  type AiLeadStatus,
} from "@/lib/ai-agent/shared";
import {
  getRecentMessages,
  queueOutboundMessages,
  updateConversation,
  type ConversationPatch,
  type ConversationRow,
} from "@/lib/ai-agent/store";

// ---------------------------------------------------------------------------
// Contrato de saída do modelo
// ---------------------------------------------------------------------------

// Aceita null, string vazia e números vindos como texto — modelos erram esses
// detalhes o tempo todo e isso não deve derrubar o atendimento.
const nullableText = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text && text.toLowerCase() !== "null" ? text : null;
  });

const nullableNumber = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed =
      typeof value === "number"
        ? value
        : Number(String(value).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  });

const nullableBoolean = z
  .union([z.boolean(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return null;
    const text = value.trim().toLowerCase();
    if (["true", "sim", "yes", "1"].includes(text)) return true;
    if (["false", "nao", "não", "no", "0"].includes(text)) return false;
    return null;
  });

const aiReplySchema = z.object({
  reply: z
    .union([z.string(), z.array(z.union([z.string(), z.number()]))])
    .transform((value) =>
      Array.isArray(value) ? value.map((item) => String(item)) : [value],
    ),
  lead_data: z
    .object({
      name: nullableText,
      vehicle: nullableText,
      year: nullableNumber,
      financed: nullableBoolean,
      bank: nullableText,
      debt_amount: nullableNumber,
      has_overdue_installments: nullableBoolean,
      overdue_installments_count: nullableNumber,
    })
    .partial()
    .optional()
    .default({}),
  // Campos que o lead disse não saber — diferente de "ainda não perguntamos".
  unknown_fields: z.array(z.string()).optional().default([]),
  status: z
    .enum(["qualifying", "qualified", "disqualified", "human_takeover"])
    .optional()
    .default("qualifying"),
  disqualification_reason: nullableText,
  ready_for_notification: z.boolean().optional().default(false),
});

export type AiReply = z.infer<typeof aiReplySchema>;

/**
 * Tolera as três formas que um modelo usa para "quase" devolver JSON: JSON
 * puro, JSON dentro de cerca de código e JSON com texto solto em volta.
 */
function parseModelJson(raw: string): unknown {
  const attempts = [raw.trim()];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    attempts.push(fenced[1].trim());
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // tenta o próximo formato
    }
  }

  throw new Error("O modelo não devolveu um JSON válido.");
}

// ---------------------------------------------------------------------------
// Prompt do sistema
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = [
  "vehicle",
  "year",
  "financed",
  "bank",
  "debt_amount",
  "has_overdue_installments",
] as const;

// Campos que aceitamos marcar como "o lead nao sabe". Qualquer outro nome
// inventado pelo modelo e descartado.
const KNOWN_FIELD_NAMES = new Set<string>([
  ...REQUIRED_FIELDS,
  "name",
  "overdue_installments_count",
]);

function describeKnownData(conversation: ConversationRow) {
  const known: Record<string, unknown> = {
    name: conversation.name,
    vehicle: conversation.vehicle,
    year: conversation.vehicle_year,
    financed: conversation.financed,
    bank: conversation.bank,
    debt_amount:
      conversation.debt_amount === null ? null : Number(conversation.debt_amount),
    has_overdue_installments: conversation.has_overdue_installments,
    overdue_installments_count: conversation.overdue_installments_count,
  };

  return known;
}

/** Fuso invalido no banco nao pode derrubar a resposta ao lead. */
function formatLocalTime(timezone: string) {
  for (const zone of [timezone, "America/Sao_Paulo"]) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: zone,
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date());
    } catch {
      // tenta o fuso padrao
    }
  }

  return new Date().toISOString();
}

function buildSystemPrompt(input: {
  settings: AiAgentSettings;
  conversation: ConversationRow;
  isFirstContact: boolean;
}) {
  const { settings, conversation, isFirstContact } = input;
  const known = describeKnownData(conversation);
  const unknown = conversation.unknown_fields ?? [];

  const missing = REQUIRED_FIELDS.filter(
    (field) =>
      (known[field] === null || known[field] === undefined) &&
      !unknown.includes(field),
  );

  const greeting = greetingForTimezone(settings.timezone);
  const localTime = formatLocalTime(settings.timezone);

  return `${settings.prompt}

---
INSTRUÇÕES OPERACIONAIS DO SISTEMA (não repasse este bloco ao lead)

Data e hora local do cliente: ${localTime} (${settings.timezone}).
Saudação correta para este horário: "${greeting}".
${
  isFirstContact
    ? 'Esta é a PRIMEIRA mensagem da conversa: comece com a saudação acima.'
    : 'A conversa já começou: NÃO repita a saudação ("bom dia"/"boa tarde"/"boa noite").'
}

Telefone do lead (já conhecido pelo sistema, nunca pergunte): ${formatBrazilianWhatsapp(conversation.whatsapp_number)}.

Informações JÁ coletadas (não pergunte de novo o que não está nulo):
${JSON.stringify(known, null, 2)}

Informações que o lead disse NÃO saber (aceite e siga em frente, nunca insista):
${unknown.length > 0 ? unknown.join(", ") : "nenhuma"}

Informações que ainda faltam, em ordem de prioridade:
${missing.length > 0 ? missing.join(", ") : "nenhuma — encerre agradecendo"}

Faça no máximo UMA pergunta nesta resposta, sobre a primeira informação que falta.

Se o lead pedir para falar com uma pessoa, responda algo como "Claro! Vou deixar o atendimento com nossa equipe 😊", não faça mais perguntas e use o status "human_takeover".

Se o lead mudar de assunto, responda de forma breve e traga a conversa de volta para a próxima informação que falta.

FORMATO DA RESPOSTA
Responda SEMPRE com um único objeto json, sem texto fora dele, neste formato:

{
  "reply": ["mensagem curta 1", "mensagem curta 2"],
  "lead_data": {
    "name": null,
    "vehicle": null,
    "year": null,
    "financed": null,
    "bank": null,
    "debt_amount": null,
    "has_overdue_installments": null,
    "overdue_installments_count": null
  },
  "unknown_fields": [],
  "status": "qualifying",
  "disqualification_reason": null,
  "ready_for_notification": false
}

Regras do json:
- "reply" é a lista de mensagens curtas a enviar, na ordem. Use de 1 a 3 itens; cada item é uma frase ou duas, como alguém digitando no WhatsApp. Nunca coloque um texto gigante num item só.
- "lead_data" traz TODAS as informações que você conhece até agora, inclusive as que já estavam na lista acima. Use null no que ainda não souber. Nunca invente valores.
- "year" é um número de 4 dígitos. "debt_amount" é um número em reais, sem símbolo nem ponto de milhar. "overdue_installments_count" é um número inteiro.
- "unknown_fields" lista os campos que o lead afirmou não saber (ex.: ["debt_amount"]).
- "status" usa "disqualified" quando o lead confirmar que o veículo está quitado ou não é financiado; "human_takeover" quando o lead pedir para falar com uma pessoa; "qualified" quando já tiver as informações principais e o veículo for financiado; caso contrário "qualifying".
- Só use "disqualified" com confirmação explícita do lead. Na dúvida, pergunte "Ele ainda está financiado?" e mantenha "qualifying".
- "disqualification_reason" só é preenchido quando o status for "disqualified".
- "ready_for_notification" é true apenas quando o status for "qualified".`;
}

function buildConversationMessages(
  history: { direction: "inbound" | "outbound"; body: string }[],
  incoming: string,
): DeepseekMessage[] {
  const messages: DeepseekMessage[] = history.map((item) => ({
    role: item.direction === "inbound" ? "user" : "assistant",
    content: item.body,
  }));

  messages.push({ role: "user", content: incoming });
  return messages;
}

// ---------------------------------------------------------------------------
// Mesclagem e regras de qualificação
// ---------------------------------------------------------------------------

/** Mantém o que já sabíamos: o modelo pode preencher lacunas, não apagar. */
function mergeValue<T>(current: T | null, incoming: T | null | undefined): T | null {
  if (incoming === null || incoming === undefined) {
    return current;
  }

  return incoming;
}

function sanitizeYear(value: number | null) {
  if (value === null) return null;
  const year = Math.round(value);
  const limit = new Date().getFullYear() + 2;
  return year >= 1950 && year <= limit ? year : null;
}

function sanitizeCount(value: number | null) {
  if (value === null) return null;
  const count = Math.round(value);
  return count >= 0 && count <= 999 ? count : null;
}

function sanitizeAmount(value: number | null) {
  if (value === null) return null;
  return value >= 0 && value <= 100_000_000 ? Math.round(value * 100) / 100 : null;
}

export type EngineDecision = {
  status: AiLeadStatus;
  patch: ConversationPatch;
  messages: { body: string; delayMs: number }[];
  runId: string;
  shouldNotify: boolean;
};

/**
 * Aplica as regras de negócio por cima do que o modelo respondeu. O modelo
 * sugere; quem decide o status gravado é o servidor — é o que impede uma
 * resposta criativa de marcar um lead como qualificado sem financiamento.
 */
function decideOutcome(
  conversation: ConversationRow,
  parsed: AiReply,
): { status: AiLeadStatus; patch: ConversationPatch; shouldNotify: boolean } {
  const data = parsed.lead_data ?? {};

  const vehicle = mergeValue(conversation.vehicle, data.vehicle ?? null);
  const vehicleYear = mergeValue(
    conversation.vehicle_year,
    sanitizeYear(data.year ?? null),
  );
  const financed = mergeValue(conversation.financed, data.financed ?? null);
  const bank = mergeValue(conversation.bank, data.bank ?? null);
  const debtAmount = mergeValue(
    conversation.debt_amount === null ? null : Number(conversation.debt_amount),
    sanitizeAmount(data.debt_amount ?? null),
  );
  const hasOverdue = mergeValue(
    conversation.has_overdue_installments,
    data.has_overdue_installments ?? null,
  );
  const overdueCount = mergeValue(
    conversation.overdue_installments_count,
    sanitizeCount(data.overdue_installments_count ?? null),
  );
  const name = mergeValue(conversation.name, data.name ?? null);

  const unknownFields = Array.from(
    new Set([...(conversation.unknown_fields ?? []), ...parsed.unknown_fields]),
  ).filter((field) => KNOWN_FIELD_NAMES.has(field));

  const patch: ConversationPatch = {
    name,
    vehicle,
    vehicle_year: vehicleYear,
    financed,
    bank,
    debt_amount: debtAmount,
    has_overdue_installments: hasOverdue,
    overdue_installments_count: overdueCount,
    unknown_fields: unknownFields,
    last_error: null,
  };

  // Regra principal: veículo quitado encerra a qualificação.
  if (financed === false) {
    return {
      status: "disqualified",
      patch: {
        ...patch,
        status: "disqualified",
        disqualification_reason:
          parsed.disqualification_reason || "Veículo não financiado / quitado",
      },
      shouldNotify: false,
    };
  }

  if (parsed.status === "disqualified") {
    // O modelo quer desqualificar mas o financiamento não foi negado: só
    // aceitamos com confirmação. Sem ela, seguimos perguntando.
    return {
      status: "qualifying",
      patch: { ...patch, status: "qualifying" },
      shouldNotify: false,
    };
  }

  if (parsed.status === "human_takeover") {
    return {
      status: "human_takeover",
      patch: {
        ...patch,
        status: "human_takeover",
        human_takeover: true,
        human_takeover_requested: true,
      },
      shouldNotify: false,
    };
  }

  // Qualificar exige financiamento confirmado e ao menos o veículo.
  const canQualify = financed === true && Boolean(vehicle);

  if (parsed.status === "qualified" && canQualify) {
    const alreadyNotified = conversation.notification_sent;

    return {
      status: "qualified",
      patch: {
        ...patch,
        status: "qualified",
        qualified_at: conversation.qualified_at ?? new Date().toISOString(),
        disqualification_reason: null,
      },
      shouldNotify: !alreadyNotified,
    };
  }

  return {
    status: "qualifying",
    patch: { ...patch, status: "qualifying" },
    shouldNotify: false,
  };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

export type EngineResult =
  | { kind: "queued"; decision: EngineDecision }
  | { kind: "skipped"; reason: string };

/**
 * Roda um turno do atendimento: monta o contexto, chama o modelo, valida o
 * retorno, grava os dados extraídos e enfileira as mensagens humanizadas.
 * O envio em si acontece depois, passo a passo, porque cada passo precisa de
 * uma espera que o n8n executa fora da requisição.
 */
export async function runConversationTurn(input: {
  settings: AiAgentSettings;
  conversation: ConversationRow;
  incomingText: string;
}): Promise<EngineResult> {
  const { settings, conversation, incomingText } = input;

  const history = await getRecentMessages(conversation.id, 20);
  const isFirstContact = history.every((item) => item.direction !== "outbound");

  const systemPrompt = buildSystemPrompt({
    settings,
    conversation,
    isFirstContact,
  });

  const raw = await generateDeepseekJson([
    { role: "system", content: systemPrompt },
    ...buildConversationMessages(
      history
        .filter((item) => item.status !== "failed")
        .map((item) => ({ direction: item.direction, body: item.body })),
      incomingText,
    ),
  ]);

  const parsed = aiReplySchema.parse(parseModelJson(raw));
  const outcome = decideOutcome(conversation, parsed);

  const bodies = splitReplyIntoMessages(parsed.reply).filter(
    (body) => body.trim().length > 0,
  );

  if (bodies.length === 0) {
    // Sem texto utilizável: grava o que foi extraído e não envia nada.
    await updateConversation(conversation.id, outcome.patch);
    return { kind: "skipped", reason: "O modelo não devolveu texto para enviar." };
  }

  const delays = buildDelaysForMessages(bodies, settings);
  const runId = randomUUID();

  await updateConversation(conversation.id, outcome.patch);
  await queueOutboundMessages({
    conversationId: conversation.id,
    clientId: conversation.client_id,
    runId,
    messages: bodies.map((body, index) => ({ body, delayMs: delays[index] })),
  });

  return {
    kind: "queued",
    decision: {
      status: outcome.status,
      patch: outcome.patch,
      messages: bodies.map((body, index) => ({ body, delayMs: delays[index] })),
      runId,
      shouldNotify: outcome.shouldNotify,
    },
  };
}

// ---------------------------------------------------------------------------
// Notificação do lead qualificado
// ---------------------------------------------------------------------------

function orNotInformed(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Não informado";
  }

  return String(value);
}

function formatCurrencyBRL(value: number | null) {
  if (value === null) {
    return "Não informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Resumo enviado ao WhatsApp pessoal do cliente. Nunca inventa dados. */
export function buildQualifiedLeadNotification(conversation: ConversationRow) {
  const phone = formatBrazilianWhatsapp(conversation.whatsapp_number);
  const overdue =
    conversation.has_overdue_installments === null
      ? "Não informado"
      : conversation.has_overdue_installments
        ? "Sim"
        : "Não";

  const lines = [
    "🔥 NOVO LEAD QUALIFICADO",
    "",
    `Nome: ${orNotInformed(conversation.name)}`,
    `WhatsApp: ${phone}`,
    "",
    `🚗 Veículo: ${orNotInformed(conversation.vehicle)}`,
    `📅 Ano: ${orNotInformed(conversation.vehicle_year)}`,
    `🏦 Banco: ${orNotInformed(conversation.bank)}`,
    `💰 Dívida aproximada: ${formatCurrencyBRL(
      conversation.debt_amount === null ? null : Number(conversation.debt_amount),
    )}`,
    `⚠️ Parcelas atrasadas: ${overdue}`,
  ];

  if (conversation.has_overdue_installments) {
    lines.push(`📌 Quantidade: ${orNotInformed(conversation.overdue_installments_count)}`);
  }

  lines.push(
    "",
    "Lead qualificado pela IA.",
    "",
    "👉 Entre em contato:",
    `+${conversation.whatsapp_number}`,
  );

  return lines.join("\n");
}
