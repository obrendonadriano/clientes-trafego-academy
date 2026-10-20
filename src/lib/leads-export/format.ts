// Formatação da exportação unificada de leads. Puro (sem servidor, sem
// Supabase): roda nos testes e no route handler.
//
// Regra geral: o que não existe fica VAZIO. Nada de "N/A", "null" ou "-".

export const ORIGINS = [
  "Coexistência",
  "WAHA (legado)",
  "Atendimento IA",
  "Formulário Meta",
] as const;
export type LeadOrigin = (typeof ORIGINS)[number];

export const LEADS_COLUMNS = [
  "Cliente",
  "Origem",
  "Campanha",
  "Anúncio",
  "Data/Hora",
  "Nome",
  "Telefone",
  "Plataforma",
  "Banco",
  "Valor da parcela",
  "Parcelas em atraso",
  "Parcelas pagas",
  "Situação do financiamento",
  "Prioridade (Meta)",
  "Telefone repetido?",
  "Conjunto",
  "Nome da campanha",
  "Formulário",
  "ID do lead",
  "ID do anúncio",
] as const;

export type ExportRow = Record<(typeof LEADS_COLUMNS)[number], string>;

/** Linha como vem da RPC admin_export_unified_leads. */
export type UnifiedLeadRecord = {
  origin: string;
  lead_id: string;
  client_name: string | null;
  entered_at: string;
  lead_name: string | null;
  phone: string | null;
  platform: string | null;
  bank: string | null;
  installment_value: string | null;
  overdue_installments: string | null;
  paid_installments: string | null;
  financing_status: string | null;
  priority: string | null;
  ad_id: string | null;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  form_name: string | null;
  ai_financed: boolean | null;
  ai_has_overdue: boolean | null;
  ai_overdue_count: number | null;
};

const text = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

// Siglas que ficam em maiúsculas depois da limpeza ("banco_bv" -> "Banco BV").
const ACRONYMS = new Set(["bv", "bb", "brb", "bmg", "btg", "c6", "xp", "rci", "cnh", "ipva"]);

/**
 * Resposta de formulário da Meta legível: tira emoji/símbolo do começo, troca
 * "_" por espaço e põe a primeira letra maiúscula.
 *   "🏦_banco_bv"          -> "Banco BV"
 *   "⏳_1_a_3_parcelas"    -> "1 a 3 parcelas"
 *   "sim,_estou_pagando"   -> "Sim, estou pagando"
 */
export function cleanAnswer(raw: unknown): string {
  const value = text(raw)
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return "";
  const words = value
    .split(" ")
    .map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word));
  const joined = words.join(" ");
  return joined.charAt(0).toLocaleUpperCase("pt-BR") + joined.slice(1);
}

/** Tira os prefixos da exportação da Meta: "l:123" -> "123", "ag:9" -> "9". */
export function stripMetaPrefix(raw: unknown): string {
  return text(raw).replace(/^(?:l|ag|as|c|f|p|pg):/i, "").trim();
}

/** Sempre +55DDDNÚMERO, só dígitos depois do "+". Sem o 55, acrescenta. */
export function formatPhone(raw: unknown): string {
  const digits = stripMetaPrefix(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

/** Último "[dd-mm]" do nome da campanha, com dois dígitos; senão vazio. */
export function campaignDate(name: unknown): string {
  const matches = [...text(name).matchAll(/\[(\d{1,2})-(\d{1,2})\]/g)];
  const last = matches.at(-1);
  if (!last) return "";
  return `[${last[1].padStart(2, "0")}-${last[2].padStart(2, "0")}]`;
}

/** Nome do anúncio; só o número (ou "Anuncio 7") vira "Anuncio 07". */
export function adLabel(name: unknown): string {
  const value = text(name);
  const numbered = /^(?:an[uú]ncio\s*)?(\d{1,3})$/i.exec(value);
  return numbered ? `Anuncio ${numbered[1].padStart(2, "0")}` : value;
}

/** ig -> Instagram, fb -> Facebook; WhatsApp como está. */
export function platformLabel(raw: unknown): string {
  const value = text(raw).toLowerCase();
  if (!value) return "";
  if (value === "ig" || value === "instagram") return "Instagram";
  if (value === "fb" || value === "facebook") return "Facebook";
  if (value === "whatsapp" || value === "wa") return "WhatsApp";
  return cleanAnswer(raw);
}

const BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** dd/mm/aaaa hh:mm no horário de Brasília. */
export function formatDateTimeBR(iso: unknown): string {
  const date = new Date(text(iso));
  if (!text(iso) || Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    BRASILIA.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/** Situação das parcelas a partir do que a IA coletou. */
function aiOverdue(record: UnifiedLeadRecord) {
  if (record.ai_has_overdue === false) return "Está tudo em dia";
  if (record.ai_has_overdue !== true) return "";
  const count = record.ai_overdue_count;
  if (typeof count === "number" && count > 0)
    return `${count} ${count === 1 ? "parcela" : "parcelas"}`;
  return "Em atraso";
}

function aiFinancing(record: UnifiedLeadRecord) {
  if (record.ai_financed === false) return "Quitado";
  if (record.ai_financed !== true) return "";
  return record.ai_has_overdue === true ? "Está em atraso" : "Sim, estou pagando";
}

/** Linhas da aba "Leads", na ordem recebida (mais recente primeiro). */
export function buildExportRows(records: UnifiedLeadRecord[]): ExportRow[] {
  const phones = records.map((record) => formatPhone(record.phone));
  const counts = new Map<string, number>();
  for (const phone of phones) if (phone) counts.set(phone, (counts.get(phone) ?? 0) + 1);

  // O mesmo lead (mesma origem + ID) nunca sai duas vezes.
  const seen = new Set<string>();

  return records.flatMap((record, index) => {
    const key = `${record.origin}|${record.lead_id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const isAi = record.origin === "Atendimento IA";
    const phone = phones[index];
    return [
      {
        Cliente: text(record.client_name),
        Origem: text(record.origin),
        Campanha: campaignDate(record.campaign_name),
        Anúncio: adLabel(record.ad_name),
        "Data/Hora": formatDateTimeBR(record.entered_at),
        Nome: text(record.lead_name),
        Telefone: phone,
        Plataforma: platformLabel(record.platform),
        Banco: cleanAnswer(record.bank),
        "Valor da parcela": cleanAnswer(record.installment_value),
        "Parcelas em atraso": isAi ? aiOverdue(record) : cleanAnswer(record.overdue_installments),
        "Parcelas pagas": cleanAnswer(record.paid_installments),
        "Situação do financiamento": isAi
          ? aiFinancing(record)
          : cleanAnswer(record.financing_status),
        "Prioridade (Meta)": text(record.priority),
        "Telefone repetido?": phone && (counts.get(phone) ?? 0) > 1 ? "Sim" : "",
        Conjunto: text(record.adset_name),
        "Nome da campanha": text(record.campaign_name),
        Formulário: text(record.form_name),
        "ID do lead": stripMetaPrefix(record.lead_id),
        "ID do anúncio": stripMetaPrefix(record.ad_id),
      },
    ];
  });
}

/** Leads_Unificados_AAAA-MM-DD_a_AAAA-MM-DD.xlsx */
export function exportFileName(from: string, to: string) {
  return `Leads_Unificados_${from}_a_${to}.xlsx`;
}
