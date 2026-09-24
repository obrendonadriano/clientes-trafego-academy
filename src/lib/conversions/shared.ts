// Tipos, constantes e formatação de conversões — sem nada de servidor, para
// poder ser importado tanto pelas páginas quanto pelos componentes de cliente.
// As consultas ficam em `src/lib/data/conversions.ts`, que usa `next/headers`
// e por isso não pode ser puxado para o bundle do navegador.

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
    return "Sem vínculo com um anúncio.";
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
