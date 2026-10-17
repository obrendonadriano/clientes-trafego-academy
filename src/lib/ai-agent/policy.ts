import { z } from "zod";
import type { AiKnowledge, AiProfile, OptionalQuestion } from "./config";

export const FIELDS = [
  "name",
  "vehicle",
  "vehicle_year",
  "financed",
  "bank",
  "debt_amount",
  "has_overdue_installments",
  "overdue_installments_count",
] as const;
export type Field = (typeof FIELDS)[number];
export type Facts = Record<Field, string | number | boolean | null>;
export const EMPTY_FACTS: Facts = Object.fromEntries(
  FIELDS.map((key) => [key, null]),
) as Facts;
const fieldSchema = z.enum(FIELDS);
export const extractionSchema = z
  .object({
    facts: z
      .array(
        z
          .object({
            field: fieldSchema,
            value: z.union([z.string().max(160), z.number(), z.boolean()]),
            evidence: z.string().min(1).max(500),
            correction: z.boolean(),
          })
          .strict(),
      )
      .max(16),
    unknown_fields: z
      .array(
        z
          .object({ field: fieldSchema, evidence: z.string().min(1).max(500) })
          .strict(),
      )
      .max(8),
    intent: z.enum([
      "qualification",
      "greeting",
      "documents",
      "price",
      "approval",
      "company",
      "hours",
      "regions",
      "bot",
      "human",
      "off_topic",
      "buys",
      "does_not_buy",
      "rules",
      "facts",
      "no_vehicle",
    ]),
    human_requested: z.boolean(),
    confidence: z.number().min(0).max(1),
    faq_index: z.number().int().min(0).max(29).nullable(),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
// Perguntas opcionais, na ordem da qualificação. Financiamento e modelo são
// sempre perguntados. (Espelha config.OPTIONAL_QUESTIONS; aqui sem import de
// valor para o módulo rodar isolado nos testes.)
export const OPTIONAL_QUESTION_ORDER: OptionalQuestion[] = [
  "vehicle_year",
  "bank",
  "debt_amount",
  "has_overdue_installments",
];

/**
 * Perguntas efetivas: um critério depende do dado, então o dado é perguntado
 * mesmo que o cliente tenha desmarcado a pergunta.
 */
export function effectiveQuestions(profile: AiProfile) {
  return {
    vehicle_year: profile.ask.vehicle_year || profile.minVehicleYear !== null,
    bank: profile.ask.bank || profile.rejectedBanks.length > 0,
    debt_amount: profile.ask.debt_amount || profile.maxDebtAmount !== null,
    has_overdue_installments:
      profile.ask.has_overdue_installments ||
      profile.overduePolicy !== "any" ||
      profile.minOverdueInstallments !== null,
  } satisfies Record<OptionalQuestion, boolean>;
}

// Por que o lead não passou. O código vai para o histórico de processamento e
// o texto para o painel (disqualification_reason).
export const DISQUALIFICATION_REASONS = {
  not_financed: "Veículo quitado / não financiado.",
  no_vehicle: "Não tem veículo.",
  overdue_policy: "Situação das parcelas fora do perfil.",
  min_overdue: "Menos parcelas atrasadas que o mínimo.",
  min_year: "Veículo abaixo do ano mínimo.",
  max_debt: "Dívida acima do máximo.",
  rejected_bank: "Banco não atendido.",
} as const;
export type DisqualificationReason = keyof typeof DISQUALIFICATION_REASONS;

/** Critérios do perfil, avaliados só sobre dados já informados. */
function profileRejection(
  facts: Facts,
  profile: AiProfile,
): DisqualificationReason | null {
  const overdue = facts.has_overdue_installments;
  if (profile.overduePolicy === "overdue_only" && overdue === false)
    return "overdue_policy";
  if (profile.overduePolicy === "current_only" && overdue === true)
    return "overdue_policy";
  if (
    profile.minOverdueInstallments !== null &&
    overdue === true &&
    typeof facts.overdue_installments_count === "number" &&
    facts.overdue_installments_count < profile.minOverdueInstallments
  )
    return "min_overdue";
  if (
    profile.minVehicleYear !== null &&
    typeof facts.vehicle_year === "number" &&
    facts.vehicle_year < profile.minVehicleYear
  )
    return "min_year";
  if (
    profile.maxDebtAmount !== null &&
    typeof facts.debt_amount === "number" &&
    facts.debt_amount > profile.maxDebtAmount
  )
    return "max_debt";
  if (
    typeof facts.bank === "string" &&
    profile.rejectedBanks.some((bank) => fold(facts.bank as string).includes(fold(bank)))
  )
    return "rejected_bank";
  return null;
}

export type PolicyDecision = {
  facts: Facts;
  unknownFields: Field[];
  status: "qualifying" | "qualified" | "disqualified";
  human: boolean;
  reason: string;
  nextField: Field | null;
  candidates: string[][];
  changedFields: Field[];
  rejectedFields: Field[];
  disqualification: DisqualificationReason | null;
};
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
export function isInjection(input: string) {
  return /ignore.{0,40}(instru|regra|prompt)|system\s*prompt|developer\s*message|revele.{0,30}(chave|token|prompt)|finja.{0,30}(aprova|humano)|marque.{0,30}qualificado/i.test(
    fold(input),
  );
}
/**
 * Resposta curta de sim/não ("sim", "s", "isso", "tá sim", "não"). Só vale
 * para a pergunta de financiamento: "em dia ou atrasada?" não se responde
 * com sim.
 */
function shortAnswer(text: string): boolean | null {
  const source = fold(text).replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!source || source.split(" ").length > 6) return null;
  if (/^(nao|n|negativo)\b/.test(source)) return false;
  if (
    /^(sim|s|ss|isso|claro|exato|positivo|uhum|aham|com certeza|(ainda )?(esta|ta|e) sim|ainda (esta|ta|sim))\b/.test(
      source,
    )
  )
    return true;
  return null;
}

/**
 * O modelo às vezes devolve "true", "sim" ou "2.020" como texto. Converte
 * para o tipo do campo antes da validação, que continua exigindo evidência.
 */
const BOOLEAN_FIELDS: Field[] = ["financed", "has_overdue_installments"];
const NUMBER_FIELDS: Field[] = [
  "vehicle_year",
  "debt_amount",
  "overdue_installments_count",
];
function coerceValue(field: Field, value: Facts[Field]): Facts[Field] {
  if (typeof value !== "string") return value;
  if (BOOLEAN_FIELDS.includes(field)) {
    const folded = fold(value).trim();
    if (/^(true|sim|yes)$/.test(folded)) return true;
    if (/^(false|nao|no)$/.test(folded)) return false;
    return value;
  }
  if (NUMBER_FIELDS.includes(field) && /^[\d.,\s]+$/.test(value.trim())) {
    const number = Number(
      value.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."),
    );
    return Number.isFinite(number) ? number : value;
  }
  return value;
}

function validValue(
  field: Field,
  value: Facts[Field],
  evidence: string,
  lastQuestion?: string | null,
) {
  const source = fold(evidence);
  if (
    field === "financed" &&
    lastQuestion === field &&
    typeof value === "boolean" &&
    shortAnswer(evidence) !== null
  )
    return value === shortAnswer(evidence);
  if (
    field === "has_overdue_installments" &&
    lastQuestion === field &&
    typeof value === "boolean" &&
    /^(sim|nao)[.!\s]*$/.test(source)
  )
    return value === source.startsWith("sim");
  if (["name", "vehicle", "bank"].includes(field))
    return (
      typeof value === "string" &&
      value.trim().length >= 2 &&
      !/^(nao sei|desconhecido|null|unknown)$/i.test(fold(value)) &&
      source.includes(fold(value))
    );
  if (field === "financed")
    return (
      typeof value === "boolean" &&
      (value
        ? /financ|prestac|parcel|alienad/.test(source) &&
          !/quit(ad|ei|ou)|nao (e |esta |ta )?(mais )?financ/.test(source)
        : /quit(ad|ei|ou)|sem financ|nao (e |esta |ta )?(mais )?financ/.test(source))
    );
  if (field === "has_overdue_installments")
    return (
      typeof value === "boolean" &&
      (value
        ? /atras|vencid/.test(source) && !/sem atras|nao.*atras/.test(source)
        : /em dia|sem atras|nao.*atras/.test(source))
    );
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return false;
  if (field === "vehicle_year")
    return (
      Number.isInteger(value) &&
      value >= 1950 &&
      value <= new Date().getFullYear() + 2 &&
      source.includes(String(value))
    );
  if (field === "overdue_installments_count")
    return (
      Number.isInteger(value) &&
      value <= 999 &&
      (source.includes(String(value)) ||
        ([
          "zero",
          "uma",
          "duas",
          "tres",
          "quatro",
          "cinco",
          "seis",
          "sete",
          "oito",
          "nove",
          "dez",
        ][value] &&
          source.includes(
            [
              "zero",
              "uma",
              "duas",
              "tres",
              "quatro",
              "cinco",
              "seis",
              "sete",
              "oito",
              "nove",
              "dez",
            ][value],
          )))
    );
  if (value > 100_000_000) return false;
  return parseAmounts(source).includes(value);
}

/**
 * Valores em reais do jeito que o lead escreve: "100k", "100 mil",
 * "R$ 100.000", "85,5 mil". Cada número vale como está e, se vier com
 * k/mil, multiplicado por mil.
 */
function parseAmounts(text: string) {
  const source = fold(text);
  return [...source.matchAll(/(\d[\d.,]*)\s*(k|mil)?\b/g)].flatMap((m) => {
    const n = Number(m[1].replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    if (!Number.isFinite(n)) return [];
    return m[2] || /mil/.test(source) ? [n, Math.round(n * 1000)] : [n];
  });
}

/** Resposta direta a uma pergunta numérica, sem depender do modelo. */
function numberAnswer(field: Field, text: string): number | null {
  const source = fold(text);
  if (field === "vehicle_year") {
    const year = /\b(19[5-9]\d|20\d\d)\b/.exec(source);
    return year ? Number(year[1]) : null;
  }
  if (field === "overdue_installments_count") {
    const count = /\b(\d{1,3})\b/.exec(source);
    if (count) return Number(count[1]);
    const words = ["zero", "uma", "duas", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
    const index = words.findIndex((word) => new RegExp(`\\b${word}\\b`).test(source));
    return index >= 0 ? index : null;
  }
  if (field === "debt_amount") {
    const amounts = parseAmounts(source);
    // Com k/mil, o valor multiplicado é o que o lead quis dizer.
    return amounts.length ? Math.max(...amounts) : null;
  }
  return null;
}
export function decidePolicy(input: {
  facts: Facts;
  unknown: string[];
  extraction: Extraction;
  incoming: string;
  knowledge: AiKnowledge;
  firstTurn: boolean;
  lastQuestion?: string | null;
  media?: string;
  // Só mídia, sem texto no turno. Ausente = comportamento antigo (só mídia).
  mediaOnly?: boolean;
}): PolicyDecision {
  const { extraction: e, incoming, knowledge: kb } = input;
  const script = kb.script;
  const says = script.replies;
  const facts = { ...input.facts },
    unknown = new Set(
      input.unknown.filter((x): x is Field => FIELDS.includes(x as Field)),
    );
  const changedFields: Field[] = [],
    rejectedFields: Field[] = [];
  const injected = isInjection(incoming);
  if (!injected && e.confidence >= 0.7) {
    for (const raw of e.facts) {
      const fact = { ...raw, value: coerceValue(raw.field, raw.value) };
      if (
        // Citação literal, sem depender de maiúscula/acento do modelo.
        !fold(incoming).includes(fold(fact.evidence)) ||
        !validValue(
          fact.field,
          fact.value,
          fact.evidence,
          input.lastQuestion,
        ) ||
        (facts[fact.field] !== null &&
          facts[fact.field] !== fact.value &&
          !fact.correction)
      ) {
        rejectedFields.push(fact.field);
        continue;
      }
      facts[fact.field] = fact.value;
      unknown.delete(fact.field);
      changedFields.push(fact.field);
    }
    for (const item of e.unknown_fields) {
      if (
        incoming.includes(item.evidence) &&
        /nao sei|nao lembro|nao (tenho|saberia)|desconheco/i.test(
          fold(item.evidence),
        ) &&
        !changedFields.includes(item.field)
      ) {
        facts[item.field] = null;
        unknown.add(item.field);
      }
    }
  }
  // Rede de segurança: resposta direta à pergunta de financiamento ("sim",
  // "ainda está financiado", "já quitei") vale mesmo se o modelo não extrair.
  if (
    !injected &&
    input.lastQuestion === "financed" &&
    facts.financed === null &&
    !changedFields.includes("financed")
  ) {
    const answer = [true, false].find((value) =>
      validValue("financed", value, incoming, "financed"),
    );
    if (answer !== undefined) {
      facts.financed = answer;
      unknown.delete("financed");
      changedFields.push("financed");
    }
  }
  // Mesma rede para ano, valor e quantidade ("2024", "100k", "3").
  const pending = input.lastQuestion as Field | null | undefined;
  if (
    !injected &&
    pending &&
    NUMBER_FIELDS.includes(pending) &&
    facts[pending] === null &&
    !changedFields.includes(pending)
  ) {
    const value = numberAnswer(pending, incoming);
    if (value !== null && validValue(pending, value, incoming, pending)) {
      facts[pending] = value;
      unknown.delete(pending);
      changedFields.push(pending);
    }
  }
  if (facts.has_overdue_installments === false) {
    facts.overdue_installments_count = 0;
    unknown.delete("overdue_installments_count");
  }
  for (const field of FIELDS) if (facts[field] !== null) unknown.delete(field);
  const profile = kb.profile;
  const asked = effectiveQuestions(profile);
  const required: Field[] = ["financed", "vehicle"];
  for (const field of OPTIONAL_QUESTION_ORDER) if (asked[field]) required.push(field);
  if (asked.has_overdue_installments && facts.has_overdue_installments === true)
    required.push("overdue_installments_count");
  const missing = required.filter(
    (field) =>
      facts[field] === null &&
      (!unknown.has(field) || field === "financed" || field === "vehicle"),
  );
  const disqualification: DisqualificationReason | null =
    facts.financed === false
      ? "not_financed"
      : e.intent === "no_vehicle" && !injected && e.confidence >= 0.7
        ? "no_vehicle"
        : profileRejection(facts, profile);
  const status = disqualification
    ? "disqualified"
    : facts.financed === true && Boolean(facts.vehicle) && missing.length === 0
      ? "qualified"
      : "qualifying";
  let human =
    injected ||
    e.human_requested ||
    e.intent === "human" ||
    /(?:falar|conversar).{0,25}(?:pessoa|humano|atendente)/i.test(incoming) ||
    kb.escalation.some(
      (rule) => rule.length > 3 && fold(incoming).includes(fold(rule)),
    );
  let reason = injected
    ? "untrusted_instruction"
    : human
      ? "human_requested"
      : "qualification";
  let nextField: Field | null =
    status === "qualifying" ? (missing[0] ?? null) : null;
  let reply = "";
  // Fora do perfil (quitado, sem veículo, critério do cliente): não é lead e
  // a IA não responde nada, nem agora nem depois.
  if (status === "disqualified") {
    human = false;
    reason = disqualification ?? "not_financed";
    nextField = null;
  } else if (human)
    reply = says.human;
  else if (
    input.media &&
    input.media !== "text" &&
    input.mediaOnly !== false
  ) {
    if (input.media === "audio") {
      reply = says.audio;
      nextField = null;
    } else {
      // Foto do carro, documento: agradece e segue com o que estava pendente,
      // sem passar para a equipe e sem afirmar o que tem na imagem.
      const followUp = nextField
        ? script.questions[nextField as keyof typeof script.questions]
        : status === "qualified"
          ? says.qualified
          : "";
      reply = [says.media, followUp].filter(Boolean).join(" ");
    }
    reason = "media_ack";
  } else if (e.intent === "bot") {
    reply = says.bot;
    nextField = null;
  } else if (e.intent === "price" || e.intent === "approval") {
    reply = e.intent === "price" ? says.price : says.approval;
    human = true;
    reason = "requires_evaluation";
    nextField = null;
  } else if (
    [
      "documents",
      "hours",
      "regions",
      "company",
      "buys",
      "does_not_buy",
      "rules",
      "facts",
    ].includes(e.intent)
  ) {
    const topics: Record<string, string[]> = {
      documents: kb.documents,
      hours: kb.hours,
      regions: kb.regions,
      company: [kb.company, kb.service].filter(Boolean),
      buys: kb.buys.length
        ? kb.buys
        : profile.vehicleTypes.length
          ? [`Trabalhamos com: ${profile.vehicleTypes.join(", ").toLowerCase()} financiados.`]
          : [],
      does_not_buy: kb.doesNotBuy,
      rules: kb.rules,
      facts: kb.allowedFacts,
    };
    const allowed = topics[e.intent];
    // Only exact tenant-authorized facts may enter the reply vocabulary.
    reply = allowed.length
      ? allowed.slice(0, 2).join(" ")
      : says.knowledgeMissing;
    human = !allowed.length;
    reason = human ? "knowledge_missing" : "knowledge_answer";
    nextField = null;
  } else if (
    e.faq_index !== null &&
    kb.faq[e.faq_index] &&
    fold(incoming).includes(fold(kb.faq[e.faq_index].question))
  ) {
    reply = kb.faq[e.faq_index].answer;
    reason = "knowledge_answer";
    nextField = null;
  } else if (status === "qualified") {
    reply = says.qualified;
    reason = "policy_qualified";
  } else if (e.intent === "off_topic") {
    reply = says.offTopic;
    nextField = null;
  } else if (nextField && unknown.has(nextField)) {
    human = true;
    reply = says.requiredUnknown;
    reason = "required_unknown";
    nextField = null;
  } else if (nextField) {
    if (input.lastQuestion === nextField && changedFields.length === 0) {
      // Não entendeu a resposta: avisa e repete a pergunta, em vez de
      // ficar "aguardando" sem dizer o que falta. Um "oi" no meio da
      // conversa é só cumprimento: cumprimenta de volta e repete.
      const prefix = e.intent === "greeting" ? script.greeting : says.waiting;
      reply = [prefix, script.questions[nextField as keyof typeof script.questions]]
        .filter(Boolean)
        .join(" ");
    } else {
      const prefix = input.firstTurn
        ? script.greeting
        : changedFields.length
          ? script.acknowledge
          : "";
      reply = [prefix, script.questions[nextField as keyof typeof script.questions]]
        .filter(Boolean)
        .join(" ");
    }
  }
  // Foto junto com texto: o texto foi tratado normalmente; o agradecimento
  // vai antes da resposta.
  if (
    reply &&
    input.mediaOnly === false &&
    (input.media === "image" || input.media === "document") &&
    !human
  )
    reply = `${says.media} ${reply}`;
  // Uma única opção: o texto sai do roteiro do cliente, nunca escrito pelo modelo.
  const candidates =
    status === "disqualified"
      ? [[]]
      : [[reply || "Recebi sua mensagem. Vou deixar a equipe conferir seu caso."]];
  return {
    facts,
    unknownFields: [...unknown],
    status,
    human,
    reason,
    nextField,
    candidates,
    changedFields,
    rejectedFields,
    disqualification,
  };
}

/** Fail-closed vocabulary: a probabilistic judge cannot prove a factual claim. */
export function validateReply(
  proposed: unknown,
  decision: PolicyDecision,
  kb: AiKnowledge,
): string[] {
  const fallback = [
    "Não tenho essa informação confirmada aqui. A equipe precisa conferir para você.",
  ];
  const approved =
    Array.isArray(proposed) &&
    proposed.every((s) => typeof s === "string") &&
    decision.candidates.some(
      (option) => JSON.stringify(option) === JSON.stringify(proposed),
    );
  const messages: string[] = approved
    ? (proposed as string[])
    : decision.candidates[0];
  const content = fold(messages.join(" "));
  if (
    messages.length > 2 ||
    messages.some((s) => s.length > 550) ||
    (content.match(/\?/g)?.length ?? 0) > 1 ||
    /(?:garantimos|garantid[oa]|aprovado|aprovacao garantida|quitamos sua divida|impedimos.{0,20}apreensao|sou (?:um )?humano)/.test(
      content,
    ) ||
    kb.forbiddenPromises.some((s) => s.length > 3 && content.includes(fold(s)))
  )
    return fallback;
  return messages;
}

/** The scheduled acknowledgement is also tenant-authored, so it uses the same
 * immutable promise/identity limits before reaching the outbound queue. */
export function offHoursReply(message: string, kb: AiKnowledge): string {
  const content = fold(message);
  if (
    isInjection(message) ||
    /garantimos|garantid[oa]|aprovad[oa]|quitamos sua divida|sou (?:um )?humano/.test(
      content,
    ) ||
    kb.forbiddenPromises.some(
      (value) => value.length > 3 && content.includes(fold(value)),
    )
  ) {
    return "Recebi sua mensagem. Nosso atendimento está fora do horário; a equipe continua no próximo período de atendimento.";
  }
  return message;
}
