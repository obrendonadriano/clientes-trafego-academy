import { z } from "zod";
import type { AiKnowledge, AiProfile, AiScript, OptionalQuestion } from "./config";

export const FIELDS = [
  "name",
  "city",
  "vehicle",
  "vehicle_year",
  "financed",
  "bank",
  "debt_amount",
  "has_overdue_installments",
  "overdue_installments_count",
  "remaining_installments",
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
    // Sempre há um ano mínimo (o padrão é 10 anos de uso).
    vehicle_year: true,
    bank: profile.ask.bank || profile.rejectedBanks.length > 0,
    debt_amount: profile.ask.debt_amount || profile.maxDebtAmount !== null,
    has_overdue_installments:
      profile.ask.has_overdue_installments ||
      profile.overduePolicy !== "any" ||
      profile.minOverdueInstallments !== null,
  } satisfies Record<OptionalQuestion, boolean>;
}

/** Idade máxima padrão: veículos com até 10 anos. */
export const DEFAULT_MAX_VEHICLE_AGE = 10;

/** Ano mínimo efetivo: o do cliente ou, sem ele, ano atual - 10. */
export function effectiveMinYear(profile: AiProfile, now = new Date()) {
  return profile.minVehicleYear ?? now.getFullYear() - DEFAULT_MAX_VEHICLE_AGE;
}

/**
 * Veículo abaixo do mínimo, mas dentro da faixa de análise manual: a IA
 * continua e o cliente recebe o lead marcado para olhar com calma.
 */
export function manualReviewYear(
  year: number | null | undefined,
  profile: AiProfile,
  now = new Date(),
) {
  if (typeof year !== "number" || profile.manualReviewYears <= 0) return null;
  const minYear = effectiveMinYear(profile, now);
  return year < minYear && year >= minYear - profile.manualReviewYears
    ? { year, minYear }
    : null;
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
  // Abaixo do mínimo só desqualifica fora da faixa de análise manual.
  if (
    typeof facts.vehicle_year === "number" &&
    facts.vehicle_year < effectiveMinYear(profile) &&
    !manualReviewYear(facts.vehicle_year, profile)
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
  // Dados pedidos na pergunta enviada ("vehicle+vehicle_year"). Vai para
  // last_question para a próxima resposta ser lida no contexto certo.
  askedKey: string | null;
};

type RuntimeStep = { fields: Field[]; text: string };

/**
 * Etapas na ordem do roteiro do cliente. Sem roteiro montado, uma pergunta por
 * dado na ordem padrão. Dado obrigatório que o roteiro não pergunta entra no
 * fim, com a pergunta individual.
 */
function scriptSteps(script: AiScript, required: Field[]): RuntimeStep[] {
  const questions = script.questions as Record<string, string>;
  const steps: RuntimeStep[] = script.steps
    ? script.steps.map((step) => ({ fields: [...step.fields] as Field[], text: step.text }))
    : [];
  const covered = new Set(steps.flatMap((step) => step.fields));
  for (const field of required) {
    if (field === "overdue_installments_count" || covered.has(field)) continue;
    steps.push({ fields: [field], text: questions[field] ?? "" });
    covered.add(field);
  }
  return steps;
}

/**
 * "[nome]" vira o primeiro nome do lead e "{empresa}" o nome da empresa do
 * cliente. Sem o dado, o marcador some com a palavra de ligação
 * (", [nome]", "à {empresa}") para a frase continuar natural.
 */
function fillPlaceholders(text: string, name: unknown, company: string | null | undefined) {
  const lead = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  const firm = (company ?? "").trim();
  let result = lead
    ? text.replace(/\[nome\]|\{nome\}/gi, lead)
    : text.replace(/,?\s*(?:\[nome\]|\{nome\})/gi, "");
  result = firm
    ? result.replace(/\{empresa\}|\[empresa\]/gi, firm)
    : result.replace(/\s*(?:(?:à|a|na|da|de|pela|com a)\s+)?(?:\{empresa\}|\[empresa\])/gi, "");
  return result.replace(/\s+([!?.,])/g, "$1");
}
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
// ---------------------------------------------------------------------------
// Português do dia a dia
// ---------------------------------------------------------------------------
// O lead escreve como fala: "ss", "tá pago", "tô pagando", "22", "100 pau",
// "tudo certinho". Estas leituras são a rede de segurança quando o modelo não
// extrai; o resultado ainda passa pela mesma validação de evidência.

/** Sem acento, caixa e pontuação: "Tá pago!!" -> "ta pago". */
const plain = (text: string) =>
  fold(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const YES =
  /^(?:s+i*m+|s+|si|isso(?: ai| mesmo)?|exato|exatamente|positivo|afirmativo|claro|com certeza|certeza|correto|pode crer|aham|uhum|unhum|yes|e sim|e isso|ta sim|esta sim|to sim|tem sim|sim senhora?|ainda(?: sim| ta| esta| e| tem)?)(?: .*)?$/;
const NO = /^(?:na+o+|n+|num|nada|negativo|nope|nem)(?: .*)?$/;

/** Sim/não curto. Mensagem longa não é resposta curta. */
function yesNo(text: string): boolean | null {
  const source = plain(text);
  if (!source || source.split(" ").length > 6) return null;
  if (NO.test(source)) return false;
  if (YES.test(source) || source === "e") return true;
  return null;
}

/** "Não sei", "sei lá", "não lembro"... */
function saysUnknown(text: string) {
  return /^(?:(?:eu )?(?:na+o+|num) (?:sei|lembro|recordo|faco ideia|tenho (?:certeza|ideia|como saber))|sei (?:la|nao)|lembro nao|vou (?:ver|olhar|conferir)|preciso (?:ver|olhar|conferir))\b/.test(
    plain(text),
  );
}

const PAID_OFF =
  /quit(?:ad|ei|ou|amos)|(?:ta|esta|ja|tudo) pago|ja paguei|paguei tudo|terminei de pagar|acabei de pagar|nao devo|nao to devendo|sem divida|a vista|sem financ|nao (?:e|esta|ta|tem|tenho|eh)? ?(?:mais )?financ/;
const STILL_PAYING =
  /financ|alienad|prestac|parcel|(?:to|tou|estou) pagando|pagando ainda|ainda (?:pago|devo|to pagando|estou pagando)|devo ainda|carne|boleto/;

/** Financiado? "tô pagando" = sim; "tá pago", "quitei" = não. */
function readFinanced(text: string, allowYesNo: boolean): boolean | null {
  const source = plain(text);
  if (PAID_OFF.test(source)) return false;
  if (STILL_PAYING.test(source)) return true;
  return allowYesNo ? yesNo(text) : null;
}

const ON_TIME =
  /em dia|tudo (?:certo|certinho|pago|ok|em ordem)|certinho|nenhum|sem atraso|nao (?:tem|tenho|ha|estou|to|ta|esta|tem nenhuma)(?: nenhuma)?(?: parcela)?(?: em)? atras|nao atrasei|nunca atrasei|pago (?:certo|certinho)|tudo em dia/;
const LATE =
  /atras|vencid|devendo|em aberto|pendente|deixei de pagar|nao paguei|parei de pagar/;

/** Parcelas: "tudo em dia" = sem atraso; "2 atrasadas", "tô devendo" = com atraso. */
function readOverdue(text: string): boolean | null {
  const source = plain(text);
  if (ON_TIME.test(source)) return false;
  if (LATE.test(source)) return true;
  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
  quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80,
  noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300,
  quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700,
  oitocentos: 800, novecentos: 900,
};

/** "cinquenta e cinco" -> 55, "tres" -> 3. Lista na ordem do texto. */
function wordNumbers(source: string) {
  const found: { value: number; end: number }[] = [];
  const tokens = source.split(" ");
  let total = 0;
  let open = false;
  tokens.forEach((token, index) => {
    if (token in NUMBER_WORDS) {
      total += NUMBER_WORDS[token];
      open = true;
    } else if (!(open && token === "e")) {
      if (open) found.push({ value: total, end: index });
      total = 0;
      open = false;
    }
  });
  if (open) found.push({ value: total, end: tokens.length });
  return { found, tokens };
}

/** Quantidade de parcelas: "3", "umas 3", "duas", "uma só". */
function readCount(text: string): number | null {
  const source = plain(text);
  const digits = /\b(\d{1,3})\b/.exec(source);
  if (digits) return Number(digits[1]);
  const { found } = wordNumbers(source);
  return found.length ? found[0].value : null;
}

/** Anos citados: "2022", "22" (=2022), "22/23" (fabricação/modelo). */
function yearsIn(text: string) {
  const source = fold(text);
  const max = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (const match of source.matchAll(/\b(\d{4}|\d{2})\b/g)) {
    const n = Number(match[1]);
    const year =
      match[1].length === 4
        ? n
        : n <= max % 100
          ? 2000 + n
          : n >= 50
            ? 1900 + n
            : null;
    if (year !== null && year >= 1950 && year <= max) years.push(year);
  }
  return years;
}

/** Ano do veículo; em "22/23" vale o ano modelo (o maior). */
function readYear(text: string): number | null {
  const years = yearsIn(text);
  return years.length ? Math.max(...years) : null;
}

/**
 * Valores em reais do jeito que o lead escreve: "100k", "100 mil", "100 pau",
 * "R$ 100.000", "85,5 mil", "1,2 milhão", "cem mil", "oitenta e cinco mil".
 * Cada número vale como está e com o multiplicador que veio junto.
 */
function amountsIn(text: string) {
  const source = fold(text);
  const scale = (unit: string | undefined) =>
    !unit ? 1 : /^(?:mi|milhao|milhoes)$/.test(unit) ? 1_000_000 : 1000;
  const amounts = [
    ...source.matchAll(/(\d[\d.,]*)\s*(k|mil|paus?|mi|milhao|milhoes)?\b/g),
  ].flatMap((m) => {
    const n = Number(m[1].replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    if (!Number.isFinite(n)) return [];
    const factor = scale(m[2]) || 1;
    return factor > 1 || /\bmil\b/.test(source)
      ? [n, Math.round(n * (factor > 1 ? factor : 1000))]
      : [n];
  });
  const { found, tokens } = wordNumbers(plain(text));
  for (const { value, end } of found) {
    const unit = tokens[end];
    amounts.push(
      unit === "mil" || unit === "pau" || unit === "paus"
        ? value * 1000
        : unit === "milhao" || unit === "milhoes"
          ? value * 1_000_000
          : value,
    );
  }
  return amounts;
}

function readAmount(text: string): number | null {
  const amounts = amountsIn(text);
  // Com multiplicador, o valor maior é o que o lead quis dizer.
  return amounts.length ? Math.max(...amounts) : null;
}

/** Nome curto respondido direto: "Bv", "no Itaú", "é um Onix 2020". */
function readShortText(
  text: string,
  field: "bank" | "vehicle" | "city" | "name",
): string | null {
  const trimmed = text.trim().replace(/[.!]+$/, "");
  if (!trimmed || trimmed.includes("?") || trimmed.length > 60) return null;
  if (yesNo(trimmed) !== null || saysUnknown(trimmed)) return null;
  const cleaned = trimmed
    .replace(
      field === "bank"
        ? /^(?:(?:e|é|eh|foi|pelo|pela|no|na|o|a)\s+)*/i
        : field === "city"
          ? /^(?:(?:e|é|eh|em|na|no|de|fica em|esta em|está em|ta em|tá em|cidade de|aqui em)\s+)*/i
          : field === "name"
            ? /^(?:(?:meu nome e|meu nome é|me chamo|eu sou o|eu sou a|sou o|sou a|sou|e o|é o|e a|é a|pode me chamar de)\s+)*/i
            : /^(?:(?:e|é|eh|meu carro e|meu carro é|o carro e|o carro é|tenho|um|uma)\s+)*/i,
      "",
    )
    .trim();
  if (
    field === "name" &&
    (/\d/.test(cleaned) ||
      cleaned.split(/\s+/).length > 4 ||
      /^(?:oi|ola|bom dia|boa tarde|boa noite|tudo bem|e ai|opa|prefiro nao|nao quero)\b/.test(plain(cleaned)))
  )
    return null;
  return cleaned.length >= 2 && cleaned.split(/\s+/).length <= 5 ? cleaned : null;
}

/**
 * Etapa que pede vários dados numa pergunta ("modelo e ano", "valor e
 * parcelas em atraso"): só leituras que não confundem um dado com outro.
 * Nome, banco, modelo e cidade ficam com o modelo.
 */
function combinedAnswer(field: Field, text: string): Facts[Field] | null {
  switch (field) {
    case "financed":
      return readFinanced(text, false);
    case "vehicle_year":
      return readYear(text);
    case "debt_amount":
      return readAmount(text);
    case "has_overdue_installments":
      return readOverdue(text);
    default:
      return null;
  }
}

/** Resposta direta ao campo perguntado, sem depender do modelo. */
function directAnswer(
  field: Field,
  text: string,
): Facts[Field] | "unknown" | null {
  if (saysUnknown(text)) return "unknown";
  switch (field) {
    case "financed":
      return readFinanced(text, true);
    case "has_overdue_installments":
      return readOverdue(text);
    case "overdue_installments_count":
    case "remaining_installments":
      return readCount(text);
    case "vehicle_year":
      return readYear(text);
    case "debt_amount":
      return readAmount(text);
    case "bank":
    case "vehicle":
    case "city":
    case "name":
      return readShortText(text, field);
    default:
      return null;
  }
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
  "remaining_installments",
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
    yesNo(evidence) !== null
  )
    return value === readFinanced(evidence, true);
  if (
    field === "has_overdue_installments" &&
    lastQuestion === field &&
    typeof value === "boolean" &&
    /^(sim|nao)[.!\s]*$/.test(source)
  )
    return value === source.startsWith("sim");
  if (["name", "vehicle", "bank", "city"].includes(field))
    return (
      typeof value === "string" &&
      value.trim().length >= 2 &&
      !/^(nao sei|desconhecido|null|unknown)$/i.test(fold(value)) &&
      source.includes(fold(value))
    );
  if (field === "financed")
    return typeof value === "boolean" && readFinanced(evidence, false) === value;
  if (field === "has_overdue_installments")
    return typeof value === "boolean" && readOverdue(evidence) === value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return false;
  if (field === "vehicle_year")
    return (
      Number.isInteger(value) &&
      value >= 1950 &&
      value <= new Date().getFullYear() + 2 &&
      yearsIn(evidence).includes(value)
    );
  if (field === "overdue_installments_count" || field === "remaining_installments")
    return (
      Number.isInteger(value) &&
      value <= 999 &&
      (source.includes(String(value)) ||
        readCount(evidence) === value ||
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
  return amountsIn(evidence).includes(value);
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
  // Nome da empresa do cliente para "{empresa}" nas mensagens do roteiro.
  companyName?: string | null;
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
  // Rede de segurança: resposta direta à pergunta feita ("sim", "tá pago",
  // "22", "100 pau", "tudo em dia", "Bv", "não sei") vale mesmo se o modelo
  // não extrair. Só para conversa de qualificação, nunca para outra intenção.
  // A pergunta pode ter pedido vários dados ("vehicle+vehicle_year").
  const askedLast = (input.lastQuestion ?? "")
    .split("+")
    .filter((field): field is Field => FIELDS.includes(field as Field));
  const single = askedLast.length === 1;
  for (const pending of askedLast) {
    if (
      injected ||
      facts[pending] !== null ||
      changedFields.includes(pending) ||
      unknown.has(pending) ||
      // Resposta curta costuma vir classificada como cumprimento ou fora do
      // assunto; pedido de preço, equipe etc. nunca vira dado.
      !(
        e.intent === "qualification" ||
        e.intent === "off_topic" ||
        (e.intent === "greeting" && !["bank", "vehicle", "name", "city"].includes(pending))
      )
    )
      continue;
    const answer = single ? directAnswer(pending, incoming) : combinedAnswer(pending, incoming);
    if (answer === "unknown") {
      unknown.add(pending);
    } else if (
      answer !== null &&
      validValue(pending, answer, incoming, single ? pending : null)
    ) {
      facts[pending] = answer;
      unknown.delete(pending);
      changedFields.push(pending);
    }
  }
  // "2 atrasadas" responde a situação e a quantidade de uma vez.
  if (
    !injected &&
    facts.has_overdue_installments === true &&
    facts.overdue_installments_count === null &&
    (askedLast.includes("has_overdue_installments") ||
      changedFields.includes("has_overdue_installments"))
  ) {
    const count = readCount(incoming);
    if (count !== null && count > 0 && count <= 999) {
      facts.overdue_installments_count = count;
      changedFields.push("overdue_installments_count");
    }
  }
  // "Quantas parcelas em atraso?" -> "2" ou "nenhuma" também responde se há atraso.
  if (
    facts.has_overdue_installments === null &&
    typeof facts.overdue_installments_count === "number"
  ) {
    facts.has_overdue_installments = facts.overdue_installments_count > 0;
    changedFields.push("has_overdue_installments");
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
  // Dado opcional do roteiro (nome, cidade...) perguntado e sem resposta:
  // segue adiante em vez de insistir.
  // Numa pergunta com vários dados respondida só em parte, o opcional que
  // faltou ainda é perguntado uma vez sozinho.
  const answeredPart = askedLast.length > 1 && askedLast.some((field) => changedFields.includes(field));
  for (const field of askedLast)
    if (
      !answeredPart &&
      !required.includes(field) &&
      facts[field] === null &&
      !changedFields.includes(field)
    )
      unknown.add(field);
  const pendingField = (field: Field) =>
    facts[field] === null &&
    (!unknown.has(field) || field === "financed" || field === "vehicle");
  let target: (RuntimeStep & { pend: Field[] }) | null = null;
  for (const step of scriptSteps(script, required)) {
    const fields = step.fields.flatMap((field): Field[] =>
      field === "has_overdue_installments" && required.includes("overdue_installments_count")
        ? [field, "overdue_installments_count"]
        : [field],
    );
    const pend = fields.filter(pendingField);
    if (pend.length) {
      target = { fields, text: step.text, pend };
      break;
    }
  }
  const missing = target ? target.pend : [];
  const questions = script.questions as Record<string, string>;
  // Nada respondido da etapa: o texto dela. Respondeu parte: só o que falta.
  const questionText = (step: NonNullable<typeof target>) =>
    step.pend.length === 1 && step.pend.length < step.fields.length
      ? questions[step.pend[0]] || step.text
      : step.text || questions[step.pend[0]] || "";
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
      const followUp = nextField && target
        ? questionText(target)
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
  } else if (nextField && target) {
    if (askedLast.includes(nextField) && changedFields.length === 0) {
      // Não entendeu a resposta: avisa e repete a pergunta, em vez de
      // ficar "aguardando" sem dizer o que falta. Um "oi" no meio da
      // conversa é só cumprimento: cumprimenta de volta e repete.
      const prefix = e.intent === "greeting" ? script.greeting : says.waiting;
      reply = [prefix, questionText(target)].filter(Boolean).join(" ");
    } else {
      // Com boas-vindas própria, a saudação curta não se repete.
      const prefix = input.firstTurn
        ? script.welcome
          ? ""
          : script.greeting
        : changedFields.length
          ? script.acknowledge
          : "";
      reply = [prefix, questionText(target)].filter(Boolean).join(" ");
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
  const notQualified = script.notQualified;
  const company = input.companyName ?? kb.company;
  const main = fillPlaceholders(
    reply || "Recebi sua mensagem. Vou deixar a equipe conferir seu caso.",
    facts.name,
    company,
  );
  const candidates =
    status === "disqualified"
      ? notQualified?.enabled && notQualified.text.trim()
        ? [[fillPlaceholders(notQualified.text, facts.name, company)]]
        : [[]]
      : input.firstTurn && script.welcome && !human
        ? [[fillPlaceholders(script.welcome, facts.name, company), main]]
        : [[main]];
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
    askedKey: nextField && target ? target.pend.join("+") : null,
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
    messages.some((s) => s.length > 1500) ||
    // Uma pergunta por balão (boas-vindas + 1ª pergunta são dois balões).
    messages.some((s) => (s.match(/\?/g)?.length ?? 0) > 1) ||
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
