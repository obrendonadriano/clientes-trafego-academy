// Tipos, constantes e formatação de conversões — sem nada de servidor, para
// poder ser importado tanto pelas páginas quanto pelos componentes de cliente.
// As consultas ficam em `src/lib/data/conversions.ts`, que usa `next/headers`
// e por isso não pode ser puxado para o bundle do navegador.

// O resultado final muda conforme o negócio do cliente. O Kanban, os textos e
// o evento enviado à Meta derivam daqui — não do segmento, que é outra coisa.
export const CONVERSION_GOAL_TYPES = ["vehicle_acquisition", "sale"] as const;
export type ConversionGoalType = (typeof CONVERSION_GOAL_TYPES)[number];

export function toConversionGoalType(value: unknown): ConversionGoalType {
  return value === "sale" ? "sale" : "vehicle_acquisition";
}

// Textos de negócio. O cliente nunca lê "Purchase", "VehicleAcquired" nem
// "CAPI": essas palavras ficam no backend e no painel do administrador.
type GoalCopy = {
  closedStage: string;
  closedStageDescription: string;
  // A etapa "Qualificados" também fala a língua do negócio.
  qualifiedDescription: string;
  closedMetric: string;
  valueLabel: string;
  valueDialogTitle: string;
  valueHint: string;
  registerValueCta: string;
  valuePrefix: string;
  movedMessage: string;
  // Só quem VENDE precisa informar o valor para concluir.
  requiresValue: boolean;
  // Nome técnico do evento final, para o painel administrativo.
  finalEvent: string;
  adminLabel: string;
};

const GOAL_COPY: Record<ConversionGoalType, GoalCopy> = {
  vehicle_acquisition: {
    closedStage: "Veículos comprados",
    closedStageDescription: "Aquisição concluída.",
    qualifiedDescription: "Veículo e negociação dentro do perfil de compra.",
    closedMetric: "Veículos comprados",
    valueLabel: "Valor pago (R$)",
    valueDialogTitle: "Valor pago pelo veículo",
    valueHint:
      "Este é o custo de aquisição do veículo e fica só no seu controle interno. Ele não é enviado à Meta e não conta como receita.",
    registerValueCta: "Registrar valor pago (opcional)",
    valuePrefix: "Valor pago",
    movedMessage: "Veículo comprado registrado.",
    requiresValue: false,
    finalEvent: "VehicleAcquired",
    adminLabel: "Aquisição",
  },
  sale: {
    closedStage: "Vendas realizadas",
    closedStageDescription: "Contrato fechado com o cliente.",
    qualifiedDescription: "Perfil e interesse reais em contratar.",
    closedMetric: "Vendas realizadas",
    valueLabel: "Valor da venda (R$)",
    valueDialogTitle: "Valor da venda",
    valueHint:
      "Este é o valor realmente fechado com o cliente. Ele é enviado à Meta como receita da conversão, para o algoritmo aprender a buscar clientes parecidos.",
    registerValueCta: "Registrar valor da venda",
    valuePrefix: "Valor da venda",
    movedMessage: "Venda registrada.",
    requiresValue: true,
    finalEvent: "Purchase",
    adminLabel: "Venda",
  },
};

export function goalCopy(goal: ConversionGoalType): GoalCopy {
  return GOAL_COPY[goal];
}

// Na visão do administrador com vários clientes, o rótulo precisa servir para
// os dois modelos ao mesmo tempo.
export const MIXED_GOAL_COPY = {
  closedStage: "Negócios fechados",
  closedStageDescription: "Resultado final de cada cliente.",
  closedMetric: "Negócios fechados",
  qualifiedDescription: "Lead dentro do perfil do cliente.",
} as const;

export type LeadQualification =
  | "pendente"
  | "qualificado"
  | "desqualificado"
  | "fechado";
export type CapiStatus = "nao_enviado" | "enviado" | "erro" | "ignorado";

// O funil tem exatamente três etapas. "desqualificado" continua existindo no
// tipo porque linhas históricas ainda o usam, mas ele saiu da interface e o
// banco recusa qualquer transição nova para ele.
export const FUNNEL_STAGES = [
  {
    key: "pendente",
    label: "Novos leads",
    event: "LeadSubmitted",
    description: "Chegaram por um anúncio Click-to-WhatsApp.",
    color: "border-t-sky-500",
  },
  {
    key: "qualificado",
    label: "Qualificados",
    event: "QualifiedLead",
    description: "Veículo e negociação dentro do perfil de compra.",
    color: "border-t-emerald-500",
  },
  {
    key: "fechado",
    // Rótulo e evento reais dependem do modelo do cliente; estes são só o
    // padrão histórico. A tela usa goalCopy()/stageLabel().
    label: "Veículos comprados",
    event: "VehicleAcquired",
    description: "Aquisição concluída.",
    color: "border-t-primary",
  },
] as const satisfies readonly {
  key: LeadQualification;
  label: string;
  event: string;
  description: string;
  color: string;
}[];

export type FunnelStage = (typeof FUNNEL_STAGES)[number]["key"];

export const QUALIFICATION_TABS = [
  { key: "todos", label: "Todos" },
  ...FUNNEL_STAGES.map((stage) => ({ key: stage.key, label: stage.label })),
] as const;

export type QualificationTab = "todos" | FunnelStage;

export function isFunnelStage(value: unknown): value is FunnelStage {
  return FUNNEL_STAGES.some((stage) => stage.key === value);
}

export const PERIOD_OPTIONS = [
  { key: "7", label: "7 dias" },
  { key: "30", label: "30 dias" },
  { key: "tudo", label: "Tudo" },
] as const;

export type PeriodOption = (typeof PERIOD_OPTIONS)[number]["key"];

export const LEADS_PAGE_SIZE = 50;

export type ConversionLead = {
  id: string;
  clientId: string;
  clientName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  name: string | null;
  phone: string;
  email: string | null;
  hasClickId: boolean;
  // Modelo de conversão do cliente dono deste lead. Na visão do administrador
  // o quadro pode misturar clientes, então o texto do cartão vem daqui.
  goalType: ConversionGoalType;
  // Só um lead com evidência de anúncio aparece como vindo da Meta.
  fromAd: boolean;
  adSourceId: string | null;
  qualification: LeadQualification;
  note: string | null;
  value: number | null;
  currency: string;
  capiStatus: CapiStatus;
  capiSentAt: string | null;
  // Só é entregue ao admin: mensagem crua de erro da Meta.
  capiResponse: string | null;
  createdAt: string;
};

export type ConversionSummary = {
  total: number;
  pending: number;
  qualified: number;
  // Etapa removida do funil; só aparece na contagem para que um lead antigo
  // nunca desapareça do total.
  discarded: number;
  closed: number;
  // Percentual de qualificados e comprados entre os leads que saíram de "novo".
  qualificationRate: number;
};

export type ConversionLeadsResult = {
  leads: ConversionLead[];
  summary: ConversionSummary;
  totalInTab: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  // Preenchido quando não dá para ler (sessão ausente, Supabase desligado).
  notice?: string;
};

// Telefone parcialmente escondido na listagem: (14) 9****-0001.
export function maskPhone(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");

  if (digits.length < 6) {
    return raw || "—";
  }

  const local = digits.length > 11 ? digits.slice(-11) : digits;
  const ddd = local.length >= 10 ? local.slice(0, 2) : "";
  const rest = local.length >= 10 ? local.slice(2) : local;
  const head = rest.slice(0, 1);
  const tail = rest.slice(-4);
  const hidden = "*".repeat(Math.max(1, rest.length - 5));

  return ddd ? `(${ddd}) ${head}${hidden}-${tail}` : `${head}${hidden}-${tail}`;
}

// Texto que o cliente lê sobre o envio da conversão. Nada de jargão técnico:
// detalhe de Dataset, CAPI e resposta crua da Meta fica no painel do admin.
export function conversionFeedback(lead: {
  qualification: LeadQualification;
  capiStatus: CapiStatus;
  fromAd: boolean;
}) {
  if (!lead.fromAd) {
    // Registrar sem atribuição é melhor do que inventar uma origem.
    return lead.qualification === "fechado"
      ? "Registrado — sem atribuição de anúncio."
      : "Sem vínculo com um anúncio.";
  }

  switch (lead.capiStatus) {
    case "enviado":
      return "Conversão enviada.";
    case "erro":
      return "Erro na conversão.";
    case "ignorado":
      return "Conversão não enviada.";
    default:
      return "Conversão aguardando envio.";
  }
}

// Rótulo de uma etapa para um modelo de negócio. "mixed" é a visão do
// administrador com clientes de modelos diferentes no mesmo quadro.
export function stageLabel(
  stage: FunnelStage,
  goal: ConversionGoalType | "mixed",
) {
  if (stage !== "fechado") {
    return FUNNEL_STAGES.find((item) => item.key === stage)!.label;
  }

  return goal === "mixed"
    ? MIXED_GOAL_COPY.closedStage
    : goalCopy(goal).closedStage;
}

export function stageDescription(
  stage: FunnelStage,
  goal: ConversionGoalType | "mixed",
) {
  const copy = goal === "mixed" ? MIXED_GOAL_COPY : goalCopy(goal);

  if (stage === "fechado") {
    return copy.closedStageDescription;
  }

  if (stage === "qualificado") {
    return copy.qualifiedDescription;
  }

  return FUNNEL_STAGES.find((item) => item.key === stage)!.description;
}
