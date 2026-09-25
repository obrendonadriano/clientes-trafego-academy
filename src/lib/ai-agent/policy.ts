import { z } from "zod";
import type { AiKnowledge } from "./config";

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
    ]),
    human_requested: z.boolean(),
    confidence: z.number().min(0).max(1),
    faq_index: z.number().int().min(0).max(29).nullable(),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
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
function validValue(
  field: Field,
  value: Facts[Field],
  evidence: string,
  lastQuestion?: string | null,
) {
  const source = fold(evidence);
  if (
    ["financed", "has_overdue_installments"].includes(field) &&
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
          !/quitad|nao (e |esta )?financ/.test(source)
        : /quitad|sem financ|nao (e |esta )?financ/.test(source))
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
  const amounts = [...source.matchAll(/\d[\d.,]*/g)].flatMap((m) => {
    const n = Number(
      m[0].replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."),
    );
    return [n, /mil/.test(source) ? n * 1000 : n];
  });
  return amounts.includes(value);
}
const QUESTIONS: Record<Field, string> = {
  name: "Como você prefere ser chamado?",
  vehicle: "Qual é o modelo do veículo?",
  vehicle_year: "Qual é o ano dele?",
  financed: "O veículo ainda está financiado?",
  bank: "Qual é o banco do financiamento?",
  debt_amount: "Você sabe o valor aproximado que ainda falta pagar?",
  has_overdue_installments: "As parcelas estão em dia ou há alguma atrasada?",
  overdue_installments_count: "Quantas parcelas estão atrasadas?",
};
export function decidePolicy(input: {
  facts: Facts;
  unknown: string[];
  extraction: Extraction;
  incoming: string;
  knowledge: AiKnowledge;
  firstTurn: boolean;
  lastQuestion?: string | null;
  media?: string;
}): PolicyDecision {
  const { extraction: e, incoming, knowledge: kb } = input;
  const facts = { ...input.facts },
    unknown = new Set(
      input.unknown.filter((x): x is Field => FIELDS.includes(x as Field)),
    );
  const changedFields: Field[] = [],
    rejectedFields: Field[] = [];
  const injected = isInjection(incoming);
  if (!injected && e.confidence >= 0.7) {
    for (const fact of e.facts) {
      if (
        !incoming.includes(fact.evidence) ||
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
  if (facts.has_overdue_installments === false) {
    facts.overdue_installments_count = 0;
    unknown.delete("overdue_installments_count");
  }
  for (const field of FIELDS) if (facts[field] !== null) unknown.delete(field);
  const required: Field[] = [
    "financed",
    "vehicle",
    "vehicle_year",
    "bank",
    "debt_amount",
    "has_overdue_installments",
  ];
  if (facts.has_overdue_installments === true)
    required.push("overdue_installments_count");
  const missing = required.filter(
    (field) =>
      facts[field] === null &&
      (!unknown.has(field) || field === "financed" || field === "vehicle"),
  );
  const status =
    facts.financed === false
      ? "disqualified"
      : facts.financed === true &&
          Boolean(facts.vehicle) &&
          missing.length === 0
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
  if (human)
    reply = "Vou deixar a conversa com a equipe para continuar com você.";
  else if (input.media && input.media !== "text") {
    reply =
      input.media === "audio"
        ? "Recebi seu áudio, mas ainda não consigo ouvi-lo por aqui. Pode me contar por texto?"
        : "Recebi o arquivo. Vou deixar a análise com a equipe, pois não consigo confirmar o conteúdo por aqui.";
    human = input.media !== "audio";
    reason = "media_fallback";
    nextField = null;
  } else if (e.intent === "bot") {
    reply =
      "Sou o assistente virtual da equipe. Se preferir, posso deixar a conversa com uma pessoa.";
    nextField = null;
  } else if (e.intent === "price" || e.intent === "approval") {
    reply =
      e.intent === "price"
        ? "Não tenho uma proposta ou valor confirmado para o seu veículo. A equipe precisa avaliar antes."
        : "Ainda não há aprovação confirmada. Essa avaliação precisa ser feita pela equipe.";
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
      buys: kb.buys,
      does_not_buy: kb.doesNotBuy,
      rules: kb.rules,
      facts: kb.allowedFacts,
    };
    const allowed = topics[e.intent];
    // Only exact tenant-authorized facts may enter the reply vocabulary.
    reply = allowed.length
      ? allowed.slice(0, 2).join(" ")
      : "Não tenho essa informação confirmada aqui. Vou deixar a equipe conferir para você.";
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
  } else if (status === "disqualified") {
    reply =
      "Neste atendimento, buscamos veículos que ainda estão financiados. Como o seu está quitado, ele não se encaixa nesse perfil.";
    reason = "not_financed";
  } else if (status === "qualified") {
    reply =
      "Já tenho os dados para a equipe avaliar seu caso. A próxima etapa é a análise deles.";
    reason = "policy_qualified";
  } else if (e.intent === "off_topic") {
    reply = "Por aqui, posso ajudar com a avaliação do seu veículo financiado.";
    nextField = null;
  } else if (nextField && unknown.has(nextField)) {
    human = true;
    reply =
      "Esse dado é necessário para avaliar o caso. Vou deixar a equipe continuar com você.";
    reason = "required_unknown";
    nextField = null;
  } else if (nextField) {
    const q = QUESTIONS[nextField];
    if (input.lastQuestion === nextField && changedFields.length === 0) {
      reply = "Tudo bem, fico aguardando essa informação para continuar.";
      nextField = null;
    } else
      reply = `${input.firstTurn ? "Olá! " : changedFields.length ? "Entendi. " : ""}${q}`;
  }
  const candidates = [
    [reply || "Recebi sua mensagem. Vou deixar a equipe conferir seu caso."],
  ];
  if (nextField && !human)
    candidates.push([
      `${input.firstTurn ? "Oi! " : "Certo. "}${QUESTIONS[nextField]}`,
    ]);
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
