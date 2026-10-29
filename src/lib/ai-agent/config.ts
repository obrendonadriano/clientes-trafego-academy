import { z } from "zod";

const lines = z.array(z.string().trim().min(1).max(500)).max(30).default([]);

// Roteiro: a IA só classifica a mensagem; o texto enviado é sempre um destes,
// escrito pelo cliente. A ordem das perguntas segue a política de qualificação.
export const SCRIPT_QUESTIONS = {
  name: "Nome do lead",
  financed: "Veículo ainda financiado?",
  vehicle: "Modelo do veículo",
  vehicle_year: "Ano do veículo",
  bank: "Banco do financiamento",
  debt_amount: "Valor que falta pagar",
  has_overdue_installments: "Parcelas em dia ou atrasadas",
  overdue_installments_count: "Quantidade de parcelas atrasadas",
  remaining_installments: "Parcelas que faltam para quitar",
  city: "Cidade do veículo",
} as const;
export type ScriptQuestion = keyof typeof SCRIPT_QUESTIONS;

// Dados que uma etapa do roteiro pode pedir. A quantidade de parcelas
// atrasadas entra junto de "parcelas em dia ou atrasadas".
export const STEP_FIELDS = [
  "name",
  "financed",
  "vehicle",
  "vehicle_year",
  "bank",
  "city",
  "debt_amount",
  "remaining_installments",
  "has_overdue_installments",
] as const;
export type StepField = (typeof STEP_FIELDS)[number];
export const STEP_FIELD_LABELS: Record<StepField, string> = {
  name: "Nome",
  financed: "Financiamento",
  vehicle: "Modelo",
  vehicle_year: "Ano",
  bank: "Banco",
  city: "Cidade",
  debt_amount: "Valor da dívida",
  remaining_installments: "Parcelas restantes",
  has_overdue_installments: "Parcelas em atraso",
};
export type ScriptStep = { fields: StepField[]; text: string };
export const MAX_SCRIPT_STEPS = 15;
export const SCRIPT_REPLIES = {
  qualified: "Lead qualificado (todos os dados coletados)",
  price: "Pergunta sobre preço ou valor",
  approval: "Pergunta sobre aprovação",
  human: "Pedido para falar com a equipe",
  bot: "Pergunta se é robô",
  offTopic: "Assunto fora do atendimento",
  audio: "Áudio recebido",
  media: "Foto ou documento recebido (vai antes da próxima pergunta)",
  knowledgeMissing: "Dúvida sem resposta cadastrada",
  requiredUnknown: "Lead não sabe um dado obrigatório",
  waiting: "Resposta não entendida (a pergunta é repetida em seguida)",
} as const;
export type ScriptReply = keyof typeof SCRIPT_REPLIES;
export const DEFAULT_SCRIPT = {
  greeting: "Olá!",
  // Vazio: a próxima pergunta vai direto, sem "Entendi." toda hora.
  acknowledge: "",
  questions: {
    name: "Qual é o seu nome?",
    financed: "O veículo ainda está financiado?",
    vehicle: "Qual é o modelo do veículo?",
    vehicle_year: "Qual é o ano dele?",
    bank: "Qual é o banco do financiamento?",
    debt_amount: "Você sabe o valor aproximado que ainda falta pagar?",
    has_overdue_installments:
      "As parcelas estão em dia ou há alguma atrasada?",
    overdue_installments_count: "Quantas parcelas estão atrasadas?",
    remaining_installments: "Quantas parcelas faltam para quitar?",
    city: "Em qual cidade o veículo se encontra?",
  } satisfies Record<ScriptQuestion, string>,
  // Primeira mensagem da conversa, em balão separado, antes da 1ª pergunta.
  // {empresa} vira o nome da empresa do cliente.
  welcome:
    "👋 Olá! Seja bem-vindo à {empresa}. Compramos veículos financiados, mesmo com parcelas atrasadas, RENAJUD ou busca e apreensão.",
  // Roteiro em etapas, na ordem do cliente. null = uma pergunta por dado na
  // ordem antiga.
  steps: [
    { fields: ["name"], text: "Qual é o seu nome?" },
    { fields: ["financed"], text: "O veículo ainda está financiado?" },
    { fields: ["vehicle", "vehicle_year"], text: "Qual é o modelo e ano do veículo?" },
    { fields: ["bank"], text: "Qual é o banco do financiamento?" },
    { fields: ["city"], text: "Em qual cidade o veículo se encontra?" },
    {
      fields: ["debt_amount", "remaining_installments", "has_overdue_installments"],
      text: "Você sabe o valor aproximado que ainda falta pagar, quantas parcelas faltam para quitar e quantas estão em atraso?",
    },
  ] as ScriptStep[] | null,
  // Mensagem para quem não se encaixa (quitado, sem veículo, fora dos
  // critérios). Vem preenchida, mas desligada: a IA fica em silêncio até o
  // cliente ligar.
  notQualified: {
    enabled: false,
    text: "Olá, [nome]! Agradecemos muito o seu contato e a confiança na {empresa}. 🙏\n\nApós analisar o seu caso, infelizmente não conseguimos prosseguir com a negociação neste momento. Isso acontece porque trabalhamos exclusivamente com veículos com prestações atrasadas ou risco de busca e apreensão.\n\nNosso modelo funciona assim:\n🚗 Compramos o financiamento do veículo\n💰 Quitamos a dívida com o banco\n✅ O cliente limpa o nome sem pagar mais nada\n\nSe você conhecer alguém que esteja com carro ou moto com prestações atrasadas ou em risco de busca e apreensão, pode indicar a {empresa}. Resolvemos o problema de forma rápida, sigilosa e sem burocracia.\n\nQualquer dúvida, estamos à disposição. Tudo de bom! 🍀",
  },
  replies: {
    qualified:
      "Maravilha! Vou passar para a nossa equipe terminar a negociação aqui com você. Aguarde um instante, por gentileza.",
    price:
      "Não tenho uma proposta ou valor confirmado para o seu veículo. A equipe precisa avaliar antes.",
    approval:
      "Ainda não há aprovação confirmada. Essa avaliação precisa ser feita pela equipe.",
    human: "Vou deixar a conversa com a equipe para continuar com você.",
    bot: "Sou o assistente virtual da equipe. Se preferir, posso deixar a conversa com uma pessoa.",
    offTopic:
      "Por aqui, posso ajudar com a avaliação do seu veículo financiado.",
    audio:
      "Recebi seu áudio, mas ainda não consigo ouvi-lo por aqui. Pode me contar por texto?",
    media: "Recebi, obrigado por enviar!",
    knowledgeMissing:
      "Não tenho essa informação confirmada aqui. Vou deixar a equipe conferir para você.",
    requiredUnknown:
      "Esse dado é necessário para avaliar o caso. Vou deixar a equipe continuar com você.",
    waiting: "Desculpe, não consegui entender.",
  } satisfies Record<ScriptReply, string>,
};
export type AiScript = typeof DEFAULT_SCRIPT;

const scriptText = (fallback: string) =>
  z.string().trim().min(1).max(500).catch(fallback);
// Saudação e "entendi" vão antes da pergunta: não podem ter pergunta própria,
// senão a resposta teria duas perguntas e seria barrada pelo validador.
const prefixText = (fallback: string) =>
  z
    .string()
    .trim()
    .max(80)
    .refine((s) => !s.includes("?"))
    .catch(fallback);
const textGroup = <T extends Record<string, string>>(defaults: T) =>
  (
    z.object(
      Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [key, scriptText(value)]),
      ),
    ) as unknown as z.ZodType<T>
  )
    .catch(() => defaults);
// `.catch` mantém o roteiro sempre utilizável: um campo ausente (contas
// antigas) ou inválido no banco volta ao padrão em vez de desligar a IA.
// Padrões antigos que ficaram gravados quando o cliente salvou o roteiro sem
// mudar estes campos. São trocados pelo padrão atual na leitura; um texto
// escrito pelo próprio cliente nunca é alterado.
const LEGACY_REPLIES: Partial<Record<ScriptReply, string[]>> = {
  qualified: [
    "Já tenho os dados para a equipe avaliar seu caso. A próxima etapa é a análise deles.",
  ],
  waiting: ["Tudo bem, fico aguardando essa informação para continuar."],
  media: [
    "Recebi o arquivo. Vou deixar a análise com a equipe, pois não consigo confirmar o conteúdo por aqui.",
  ],
};
function dropLegacyReplies(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const script = value as { replies?: unknown };
  if (!script.replies || typeof script.replies !== "object") return value;
  const replies = { ...(script.replies as Record<string, unknown>) };
  for (const [key, legacy] of Object.entries(LEGACY_REPLIES)) {
    if (legacy?.includes(String(replies[key] ?? "").trim())) delete replies[key];
  }
  // "Entendi." antes de cada pergunta era o padrão antigo.
  const legacyAck = (script as { acknowledge?: unknown }).acknowledge === "Entendi.";
  return { ...script, replies, ...(legacyAck ? { acknowledge: "" } : {}) };
}

const stepSchema = z.object({
  // Sem dado marcado = pergunta livre: a resposta é guardada como veio.
  fields: z.array(z.enum(STEP_FIELDS)).max(STEP_FIELDS.length),
  text: z.string().trim().min(1).max(500),
});

export const scriptSchema = z
  .preprocess(dropLegacyReplies, z.object({
    greeting: prefixText(DEFAULT_SCRIPT.greeting),
    acknowledge: prefixText(DEFAULT_SCRIPT.acknowledge),
    questions: textGroup(DEFAULT_SCRIPT.questions),
    replies: textGroup(DEFAULT_SCRIPT.replies),
    // Campo ausente (roteiro salvo antes desta versão) recebe o padrão;
    // valor inválido volta ao padrão também.
    welcome: z
      .string()
      .trim()
      .max(1000)
      .default(DEFAULT_SCRIPT.welcome)
      .catch(DEFAULT_SCRIPT.welcome),
    steps: z
      .array(stepSchema)
      .min(1)
      .max(MAX_SCRIPT_STEPS)
      .nullable()
      .default(() => DEFAULT_SCRIPT.steps)
      .catch(() => DEFAULT_SCRIPT.steps),
    notQualified: z
      .object({
        enabled: z.boolean().catch(false),
        text: z.string().trim().max(1500).catch(DEFAULT_SCRIPT.notQualified.text),
      })
      .default(() => DEFAULT_SCRIPT.notQualified)
      .catch(() => DEFAULT_SCRIPT.notQualified),
  }))
  .catch(() => DEFAULT_SCRIPT);

// Mesmas travas do validador de resposta (policy.validateReply), aplicadas na
// hora de salvar: o cliente vê o erro no painel em vez de a mensagem ser
// trocada silenciosamente pelo texto de segurança durante o atendimento.
const FORBIDDEN_CLAIM =
  /garantimos|garantid[oa]|aprovado|aprovacao garantida|quitamos sua divida|impedimos.{0,20}apreensao|sou (?:um )?humano/;
export function checkScriptInput(script: AiScript): string | null {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  if (script.replies.media.includes("?"))
    return "A mensagem de foto ou documento recebido vai antes da próxima pergunta: não use ponto de interrogação nela.";
  if (script.replies.waiting.includes("?"))
    return "A mensagem de resposta não entendida vai antes da pergunta repetida: não use ponto de interrogação nela.";
  for (const prefix of [script.greeting, script.acknowledge]) {
    if (prefix.length > 80 || prefix.includes("?"))
      return "Saudação e confirmação: até 80 caracteres e sem ponto de interrogação.";
  }
  const longTexts: [string, string, number][] = [
    ["Boas-vindas", script.welcome ?? "", 1000],
    [
      "Mensagem de não qualificação",
      script.notQualified?.enabled ? script.notQualified.text : "",
      1500,
    ],
  ];
  for (const [label, text, max] of longTexts) {
    if (text.length > max) return `${label}: até ${max} caracteres.`;
    if ((text.match(/\?/g)?.length ?? 0) > 1)
      return `${label}: use no máximo uma pergunta.`;
    if (FORBIDDEN_CLAIM.test(fold(text)))
      return `${label}: tem promessa ou afirmação não permitida.`;
  }
  if (script.notQualified?.enabled && !script.notQualified.text.trim())
    return "Escreva a mensagem de não qualificação ou desligue o envio.";
  if (script.steps) {
    if (!script.steps.length || script.steps.length > MAX_SCRIPT_STEPS)
      return `O roteiro precisa de 1 a ${MAX_SCRIPT_STEPS} perguntas.`;
    const seen = new Set<string>();
    const freeTexts = new Set<string>();
    for (const [index, step] of script.steps.entries()) {
      if (!step.fields.length) {
        const key = fold(step.text).trim();
        if (key && freeTexts.has(key))
          return `Pergunta ${index + 1}: já existe uma pergunta livre com esse texto.`;
        freeTexts.add(key);
      }
      for (const field of step.fields) {
        if (seen.has(field))
          return `O dado "${STEP_FIELD_LABELS[field]}" aparece em mais de uma pergunta.`;
        seen.add(field);
      }
      if (!step.text.trim() || step.text.length > 500)
        return `Pergunta ${index + 1}: escreva o texto (até 500 caracteres).`;
      if ((step.text.match(/\?/g)?.length ?? 0) > 1)
        return `Pergunta ${index + 1}: use no máximo um ponto de interrogação.`;
      if (FORBIDDEN_CLAIM.test(fold(step.text)))
        return `Pergunta ${index + 1}: tem promessa ou afirmação não permitida.`;
    }
    for (const required of ["financed", "vehicle"] as const)
      if (!seen.has(required))
        return `O roteiro precisa perguntar "${STEP_FIELD_LABELS[required]}".`;
  }
  const texts = [
    ...Object.values(script.questions),
    ...Object.values(script.replies),
  ];
  for (const text of texts) {
    if (!text.trim() || text.length > 500)
      return "Preencha todas as mensagens, com até 500 caracteres cada.";
    if ((text.match(/\?/g)?.length ?? 0) > 1)
      return `Use no máximo uma pergunta por mensagem: "${text.slice(0, 60)}".`;
    if (FORBIDDEN_CLAIM.test(fold(text)))
      return `Mensagem com promessa ou afirmação não permitida: "${text.slice(0, 60)}".`;
  }
  return null;
}

// Frases de ativação: a IA só abre conversa com quem chega por uma delas (o
// texto pré-preenchido dos anúncios). Conversas já abertas continuam.
export const MAX_ACTIVATION_PHRASES = 10;
export const DEFAULT_ACTIVATION = {
  enabled: true,
  phrases: [
    "Olá! Quero fazer uma avaliação do meu veículo.",
    "Olá! Tenho um veículo e gostaria de solicitar uma análise.",
  ],
};
export type AiActivation = typeof DEFAULT_ACTIVATION;
const activationPhrase = z.string().trim().min(3).max(200);
export const activationSchema = z
  .preprocess(
    // Formato anterior guardava uma frase só em `phrase`.
    (value) => {
      if (!value || typeof value !== "object") return value;
      const raw = value as Record<string, unknown>;
      return "phrases" in raw || typeof raw.phrase !== "string"
        ? raw
        : { ...raw, phrases: [raw.phrase] };
    },
    z.object({
      enabled: z.boolean().catch(DEFAULT_ACTIVATION.enabled),
      phrases: z
        .array(activationPhrase)
        .min(1)
        .max(MAX_ACTIVATION_PHRASES)
        .catch(() => DEFAULT_ACTIVATION.phrases),
    }),
  )
  .catch(() => DEFAULT_ACTIVATION);

// Perfil do lead qualificado, montado pelo cliente no quiz de configuração.
// O nicho é fixo (veículo financiado); estes critérios refinam quem passa.
// Sem quiz feito, o padrão reproduz a regra original: pergunta tudo e aceita
// parcelas em dia ou atrasadas, sem limites.
export const VEHICLE_TYPES = [
  "Carro",
  "Moto",
  "Caminhonete",
  "Caminhão",
  "Van / utilitário",
] as const;
export const OVERDUE_POLICIES = {
  any: "Em dia ou atrasadas",
  overdue_only: "Só com parcelas atrasadas",
  current_only: "Só com parcelas em dia",
} as const;
export type OverduePolicy = keyof typeof OVERDUE_POLICIES;
// Perguntas opcionais. Financiamento e modelo são sempre perguntados.
export const OPTIONAL_QUESTIONS = [
  "vehicle_year",
  "bank",
  "debt_amount",
  "has_overdue_installments",
] as const;
export type OptionalQuestion = (typeof OPTIONAL_QUESTIONS)[number];
export const DEFAULT_PROFILE = {
  completedAt: null as string | null,
  vehicleTypes: ["Carro"] as string[],
  overduePolicy: "any" as OverduePolicy,
  minOverdueInstallments: null as number | null,
  // null = idade máxima padrão de 10 anos (ano atual - 10).
  minVehicleYear: null as number | null,
  // Veículos até N anos abaixo do mínimo: a IA atende e avisa o cliente para
  // análise manual em vez de descartar. 0 desliga.
  manualReviewYears: 5,
  maxDebtAmount: null as number | null,
  rejectedBanks: [] as string[],
  ask: {
    vehicle_year: true,
    bank: true,
    debt_amount: true,
    has_overdue_installments: true,
  } as Record<OptionalQuestion, boolean>,
  notes: "",
};
export type AiProfile = typeof DEFAULT_PROFILE;
const optionalInt = (min: number, max: number) =>
  z.number().int().min(min).max(max).nullable().catch(null);
export const profileSchema = z
  .object({
    completedAt: z.string().max(40).nullable().catch(null),
    vehicleTypes: z
      .array(z.string().trim().min(1).max(60))
      .max(12)
      .catch(() => DEFAULT_PROFILE.vehicleTypes),
    overduePolicy: z
      .enum(["any", "overdue_only", "current_only"])
      .catch("any"),
    minOverdueInstallments: optionalInt(1, 120),
    minVehicleYear: optionalInt(1950, 2100),
    manualReviewYears: z.number().int().min(0).max(10).catch(5),
    maxDebtAmount: z.number().positive().max(100_000_000).nullable().catch(null),
    rejectedBanks: z
      .array(z.string().trim().min(2).max(60))
      .max(30)
      .catch(() => []),
    ask: z
      .object({
        vehicle_year: z.boolean().catch(true),
        bank: z.boolean().catch(true),
        debt_amount: z.boolean().catch(true),
        has_overdue_installments: z.boolean().catch(true),
      })
      .catch(() => DEFAULT_PROFILE.ask),
    notes: z.string().trim().max(1000).catch(""),
  })
  .catch(() => DEFAULT_PROFILE);

// Compara sem acento, caixa, pontuação ou emoji: "ola quero fazer uma
// avaliacao do meu veiculo 🚗" ativa. O lead pode escrever mais coisa junto.
export function normalizeActivationText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
// Mensagem pronta do botão do anúncio (Click-to-WhatsApp). O texto muda com
// o idioma do celular do lead (Brasil, Portugal, inglês, espanhol), então
// todas as variações abrem conversa junto com as frases do cliente.
export const AD_DEFAULT_MESSAGES = [
  "Olá! Posso ter mais informações sobre isso?",
  "Olá! Posso saber mais informações sobre isto?",
  "Olá! Posso obter mais informações sobre isto?",
  "Olá! Gostaria de saber mais sobre isto.",
  "Olá! Quero mais informações.",
  "Hello! Can I get more info on this?",
  "Hi! Can I get more info on this?",
  "¡Hola! ¿Puedo obtener más información sobre esto?",
  "¡Hola! Quiero más información.",
];

export function matchesActivationPhrase(
  message: string,
  phrases: string | string[],
) {
  const text = normalizeActivationText(message);
  return [...(Array.isArray(phrases) ? phrases : [phrases]), ...AD_DEFAULT_MESSAGES].some((phrase) => {
    const expected = normalizeActivationText(phrase);
    return Boolean(expected) && text.includes(expected);
  });
}

export const knowledgeSchema = z
  .object({
    company: z.string().trim().max(200).default(""),
    service: z.string().trim().max(500).default(""),
    buys: lines,
    doesNotBuy: lines,
    regions: lines,
    hours: lines,
    documents: lines,
    rules: lines,
    forbiddenPromises: lines,
    allowedFacts: lines,
    escalation: lines,
    faq: z
      .array(
        z
          .object({
            question: z.string().trim().min(3).max(200),
            answer: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    script: scriptSchema,
    activation: activationSchema,
    profile: profileSchema,
  })
  .strict();
export type AiKnowledge = z.infer<typeof knowledgeSchema>;
export const EMPTY_KNOWLEDGE = knowledgeSchema.parse({});
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleSchema = z
  .object({
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: time,
    end: time,
    timezone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }, "Fuso horário inválido."),
    offHoursMessage: z.string().trim().max(500),
  })
  .strict()
  .refine(
    (s) => s.start !== s.end,
    "Defina horários de início e fim diferentes.",
  );
export type AiSchedule = z.infer<typeof scheduleSchema>;
export const DEFAULT_SCHEDULE: AiSchedule = {
  weekdays: [1, 2, 3, 4, 5],
  start: "09:00",
  end: "18:00",
  timezone: "America/Sao_Paulo",
  offHoursMessage:
    "Recebi sua mensagem. Nosso atendimento está fora do horário agora; a equipe retorna no próximo período de atendimento.",
};

/** Closed-period key is the most recent closing boundary, including weekends. */
export function businessHours(
  alwaysOn: boolean,
  schedule: AiSchedule,
  now = new Date(),
) {
  if (alwaysOn) return { open: true, period: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: schedule.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${p.year}-${p.month}-${p.day}T00:00:00Z`);
  const minute = Number(p.hour) * 60 + Number(p.minute);
  const minutes = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const start = minutes(schedule.start),
    end = minutes(schedule.end),
    overnight = start > end;
  const day = date.getUTCDay(),
    yesterday = (day + 6) % 7;
  const open = overnight
    ? (schedule.weekdays.includes(day) && minute >= start) ||
      (schedule.weekdays.includes(yesterday) && minute < end)
    : schedule.weekdays.includes(day) && minute >= start && minute < end;
  if (open) return { open, period: "" };
  for (let i = 0; i < 8; i++) {
    const closeDate = new Date(date.getTime() - i * 86400000);
    const openingDay = (closeDate.getUTCDay() + (overnight ? 6 : 0)) % 7;
    if (schedule.weekdays.includes(openingDay) && (i > 0 || minute >= end)) {
      return {
        open,
        period: `${closeDate.toISOString().slice(0, 10)}T${schedule.end}@${schedule.timezone}`,
      };
    }
  }
  return { open: false, period: "invalid-schedule" };
}
