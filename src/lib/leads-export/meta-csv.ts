// Leitura do CSV de leads baixado do Gerenciador de Anúncios da Meta.
//
// O arquivo vem em UTF-16 com BOM, separado por TAB, com as colunas fixas
// (id, created_time, ad_id, ad_name, adset_name, campaign_name, form_name,
// platform, Priority, full_name, phone_number...) e uma coluna por pergunta
// do formulário. Puro: roda nos testes e no route handler.

import { cleanAnswer, formatPhone, platformLabel, stripMetaPrefix } from "./format";

export type MetaFormLeadRow = {
  meta_lead_id: string;
  created_time: string;
  ad_id: string | null;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  form_id: string | null;
  form_name: string | null;
  platform: string | null;
  priority: string | null;
  full_name: string | null;
  phone: string | null;
  bank: string | null;
  installment_value: string | null;
  overdue_installments: string | null;
  paid_installments: string | null;
  financing_status: string | null;
  answers: Record<string, string>;
};

export type ParsedMetaCsv = {
  rows: MetaFormLeadRow[];
  // Linhas descartadas (sem id ou sem data), com o número da linha no arquivo.
  rejected: { line: number; reason: string }[];
  questions: string[];
};

/** UTF-16 (LE/BE, com BOM) ou UTF-8. */
export function decodeMetaCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  // UTF-16 sem BOM: metade dos bytes zerados.
  const sample = bytes.subarray(0, Math.min(bytes.length, 200));
  const zeros = sample.filter((byte, index) => index % 2 === 1 && byte === 0).length;
  if (sample.length > 10 && zeros > sample.length / 4)
    return new TextDecoder("utf-16le").decode(bytes);
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** CSV/TSV com aspas (campos com quebra de linha e "" escapado). */
export function parseDelimited(text: string): string[][] {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const FIXED: Record<string, keyof MetaFormLeadRow | "skip"> = {
  id: "meta_lead_id",
  created_time: "created_time",
  ad_id: "ad_id",
  ad_name: "ad_name",
  adset_id: "adset_id",
  adset_name: "adset_name",
  campaign_id: "campaign_id",
  campaign_name: "campaign_name",
  form_id: "form_id",
  form_name: "form_name",
  platform: "platform",
  priority: "priority",
  full_name: "full_name",
  phone_number: "phone",
  // Colunas da Meta que não entram na planilha.
  is_organic: "skip",
  lead_status: "skip",
  inbox_url: "skip",
  email: "skip",
};

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Em qual coluna da planilha cai cada pergunta do formulário. */
export function classifyQuestion(
  header: string,
): "bank" | "installment_value" | "overdue_installments" | "paid_installments" | "financing_status" | null {
  const q = fold(header);
  if (/atras/.test(q)) return "overdue_installments";
  // "parcelas já foram pagas", "quantas você já pagou" — nunca "estou pagando".
  if (/\bparcelas?\b.*\bpagas\b|\bquantas\b.*\bpag(ou|as)\b|\bja pagou\b/.test(q))
    return "paid_installments";
  if (/valor|quanto (voce )?paga|mensalidade/.test(q)) return "installment_value";
  if (/banco|financeira|instituicao/.test(q)) return "bank";
  if (/situacao|financiamento|esta pagando|negativ/.test(q)) return "financing_status";
  return null;
}

const nullable = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export function parseMetaLeadsCsv(bytes: Uint8Array): ParsedMetaCsv {
  const table = parseDelimited(decodeMetaCsv(bytes));
  const [header = [], ...body] = table;
  const columns = header.map((name) => name.trim());
  const keys = columns.map((name) => FIXED[name.toLowerCase()] ?? null);
  const questions = columns.filter((_, index) => keys[index] === null);

  const rows: MetaFormLeadRow[] = [];
  const rejected: ParsedMetaCsv["rejected"] = [];

  body.forEach((cells, rowIndex) => {
    const line = rowIndex + 2;
    const row: MetaFormLeadRow = {
      meta_lead_id: "",
      created_time: "",
      ad_id: null,
      ad_name: null,
      adset_id: null,
      adset_name: null,
      campaign_id: null,
      campaign_name: null,
      form_id: null,
      form_name: null,
      platform: null,
      priority: null,
      full_name: null,
      phone: null,
      bank: null,
      installment_value: null,
      overdue_installments: null,
      paid_installments: null,
      financing_status: null,
      answers: {},
    };

    columns.forEach((name, index) => {
      const value = cells[index] ?? "";
      const key = keys[index];
      if (key === "skip") return;
      if (key === null) {
        const answer = cleanAnswer(value);
        if (!answer) return;
        const question = cleanAnswer(name);
        row.answers[question] = answer;
        const target = classifyQuestion(name);
        if (target && !row[target]) row[target] = answer;
        return;
      }
      if (key === "meta_lead_id" || key === "ad_id" || key === "adset_id" || key === "campaign_id" || key === "form_id") {
        (row[key] as string | null) = nullable(stripMetaPrefix(value));
      } else if (key === "phone") {
        row.phone = nullable(formatPhone(value));
      } else if (key === "platform") {
        row.platform = nullable(platformLabel(value));
      } else if (key === "created_time") {
        const date = new Date(value.trim());
        row.created_time = Number.isNaN(date.getTime()) ? "" : date.toISOString();
      } else if (key !== "answers") {
        (row[key] as string | null) = nullable(value);
      }
    });

    row.meta_lead_id = row.meta_lead_id ?? "";
    if (!row.meta_lead_id) {
      rejected.push({ line, reason: "Sem id do lead." });
      return;
    }
    if (!row.created_time) {
      rejected.push({ line, reason: "Data (created_time) inválida." });
      return;
    }
    rows.push(row);
  });

  return { rows, rejected, questions };
}
