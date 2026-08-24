// Tipos, constantes e formatação de conversões — sem nada de servidor, para
// poder ser importado tanto pelas páginas quanto pelos componentes de cliente.
// As consultas ficam em `src/lib/data/conversions.ts`, que usa `next/headers`
// e por isso não pode ser puxado para o bundle do navegador.

export type LeadQualification = "pendente" | "qualificado" | "desqualificado";
export type CapiStatus = "nao_enviado" | "enviado" | "erro" | "ignorado";

export const QUALIFICATION_TABS = [
  { key: "pendente", label: "Pendentes" },
  { key: "qualificado", label: "Qualificados" },
  { key: "desqualificado", label: "Descartados" },
  { key: "todos", label: "Todos" },
] as const;

export type QualificationTab = (typeof QUALIFICATION_TABS)[number]["key"];

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
  qualification: LeadQualification;
  note: string | null;
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
  discarded: number;
  // Percentual de qualificados entre os já avaliados.
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
