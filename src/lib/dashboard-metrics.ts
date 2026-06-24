import {
  endOfDay,
  endOfMonth,
  format,
  isWithinInterval,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { PerformancePoint, RawCampaignMetric } from "@/lib/types";

// Range custom padrão exibido nos seletores de período (últimos 7 dias reais).
export function getDefaultCustomRange(now = new Date()) {
  return {
    start: format(subDays(startOfDay(now), 6), "yyyy-MM-dd"),
    end: format(startOfDay(now), "yyyy-MM-dd"),
  };
}

export type DashboardPeriodValue =
  | "Hoje"
  | "Ontem"
  | "Últimos 7 dias"
  | "Últimos 30 dias"
  | "Este mês"
  | "Mês passado"
  | "Personalizado";

type DateRange = {
  start: Date;
  end: Date;
};

export type MetricTotals = {
  amountSpent: number;
  reach: number;
  impressions: number;
  clicks: number;
  results: number;
  resultLabel: string;
  leads: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerLead: number;
  roi: number;
  roas: number;
  frequency: number;
  // Moeda original do conjunto ("BRL" quando nativo ou misturado) e os valores
  // monetários reconstruídos nessa moeda (para exibir, ex.: US$ ao lado do R$).
  currency: string;
  amountSpentOriginal: number;
  cpcOriginal: number;
  cpmOriginal: number;
  costPerLeadOriginal: number;
};

const moneyFormatters = new Map<string, Intl.NumberFormat>();

// Formata um valor numa moeda (R$, US$, etc.) com locale pt-BR.
export function formatMoney(value: number, currency = "BRL") {
  const code = (currency || "BRL").toUpperCase();
  let formatter = moneyFormatters.get(code);

  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code,
    });
    moneyFormatters.set(code, formatter);
  }

  return formatter.format(Number.isFinite(value) ? value : 0);
}

// Determina a moeda estrangeira única de um conjunto de linhas. Se todas forem
// BRL, ou se houver mistura de moedas estrangeiras, devolve "BRL".
export function resolveCurrency(rows: Pick<RawCampaignMetric, "currency">[]) {
  const foreign = new Set(
    rows
      .map((row) => (row.currency || "BRL").toUpperCase())
      .filter((currency) => currency !== "BRL"),
  );

  return foreign.size === 1 ? [...foreign][0] : "BRL";
}

// Categoria do resultado principal, derivada do OBJETIVO da campanha (Meta),
// e não mais do nome dela.
export type ResultCategory =
  | "purchase"
  | "lead"
  | "messaging"
  | "traffic"
  | "awareness"
  | "other";

// Mapeia o objective da Meta (ex.: OUTCOME_SALES) para a categoria de resultado.
export function getResultCategoryFromObjective(
  objective?: string | null,
): ResultCategory {
  const value = (objective ?? "").toUpperCase();

  if (!value) {
    return "other";
  }

  if (value.includes("SALES") || value.includes("CONVERSION") || value.includes("CATALOG")) {
    return "purchase";
  }
  if (value.includes("LEAD")) {
    return "lead";
  }
  // MESSAGES (objetivo legado de mensagens). ENGAGEMENT NÃO entra aqui de
  // propósito: pode ser mensagem ou engajamento de post, então é tratado como
  // genérico (a conversão real é detectada pelas ações no sync).
  if (value.includes("MESSAGE")) {
    return "messaging";
  }
  if (value.includes("TRAFFIC") || value.includes("LINK_CLICK")) {
    return "traffic";
  }
  if (value.includes("AWARENESS") || value.includes("REACH") || value.includes("VIDEO_VIEW")) {
    return "awareness";
  }

  return "other";
}

// Objetivos "fortes" definem o resultado mesmo quando a contagem é 0 (ex.:
// campanha de venda sem vendas → "Compras no site: 0"). Os demais (tráfego/
// engajamento/etc.) deixam a conversão real ser detectada pelas ações.
export function isStrongResultCategory(category: ResultCategory) {
  return category === "purchase" || category === "lead" || category === "messaging";
}

// Categoria derivada do CONJUNTO DE ANÚNCIOS (destino + meta de otimização).
// Mais preciso que o objetivo: distingue lead-no-site de lead-via-WhatsApp.
// Retorna null quando não dá para decidir (cai no objetivo da campanha).
export function getResultCategoryFromAdSet(
  optimizationGoal?: string | null,
  destinationType?: string | null,
): ResultCategory | null {
  const dest = (destinationType ?? "").toUpperCase();
  if (
    dest.includes("WHATSAPP") ||
    dest.includes("MESSENGER") ||
    dest.includes("INSTAGRAM_DIRECT") ||
    dest.includes("MESSAGING")
  ) {
    return "messaging";
  }

  const goal = (optimizationGoal ?? "").toUpperCase();
  if (goal.includes("CONVERSATION") || goal.includes("REPL") || goal.includes("MESSAG")) {
    return "messaging";
  }
  if (goal.includes("LEAD")) {
    return "lead";
  }
  if (goal.includes("LANDING_PAGE") || goal.includes("LINK_CLICK")) {
    return "traffic";
  }
  if (goal.includes("REACH") || goal.includes("IMPRESSION") || goal.includes("AD_RECALL")) {
    return "awareness";
  }

  return null;
}

// Rótulo amigável exibido para cada categoria de resultado.
export function getResultLabelForCategory(category: ResultCategory): string {
  switch (category) {
    case "purchase":
      return "Compras no site";
    case "lead":
      return "Leads no site";
    case "messaging":
      return "Conversas por mensagens iniciadas";
    case "traffic":
      return "Cliques no link";
    case "awareness":
      return "Alcance";
    default:
      return "Resultados";
  }
}

// action_types da Meta que contam como resultado de cada categoria. Vazio =
// categoria sem ação específica (usa o resultado genérico no sync).
export function getResultActionTypesForCategory(category: ResultCategory): string[] {
  switch (category) {
    case "purchase":
      return ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
    case "lead":
      return [
        "lead",
        "onsite_conversion.lead_grouped",
        "offsite_conversion.fb_pixel_lead",
        "onsite_web_lead",
      ];
    case "messaging":
      return [
        "onsite_conversion.messaging_conversation_started_7d",
        "onsite_conversion.total_messaging_connection",
        "onsite_conversion.total_messaging_connection_7d",
        "onsite_conversion.messaging_first_reply",
        // Lead captado via WhatsApp é contado pela Meta como conversa.
        "onsite_conversion.lead_grouped",
        "lead",
      ];
    case "traffic":
      return ["landing_page_view", "link_click"];
    default:
      return [];
  }
}

export function getLeadEquivalent(row: Pick<RawCampaignMetric, "leads" | "results" | "resultLabel">) {
  if (row.leads > 0) {
    return row.leads;
  }

  const label = row.resultLabel.trim().toLowerCase();

  if (!label || label === "sem resultado") {
    return 0;
  }

  const leadLikePatterns = [
    "lead",
    "cadastro",
    "messaging",
    "message",
    "conversation",
    "conversa",
  ];

  if (leadLikePatterns.some((pattern) => label.includes(pattern))) {
    return row.results;
  }

  return 0;
}

// Soma de resultados de um conjunto de linhas (o sync já grava a contagem da
// categoria correta — definida pelo objetivo da campanha).
export function sumResults(rows: Pick<RawCampaignMetric, "results">[]) {
  return rows.reduce((sum, row) => sum + row.results, 0);
}

function isSingleDayRange(range: DateRange) {
  return isSameDay(range.start, range.end);
}

function getRowsInRange(rows: RawCampaignMetric[], range: DateRange) {
  return rows.filter((row) =>
    isWithinInterval(parseISO(row.date), { start: range.start, end: range.end }),
  );
}

function selectSummaryGranularityForRange(
  rows: RawCampaignMetric[],
  range: DateRange,
) {
  const rowsInRange = getRowsInRange(rows, range);

  if (rowsInRange.length === 0) {
    return [];
  }

  const dailyRows = rowsInRange.filter((row) => row.granularity === "day");

  if (dailyRows.length > 0) {
    return dailyRows;
  }

  return rowsInRange;
}

function selectChartGranularityForRange(rows: RawCampaignMetric[], range: DateRange) {
  const rowsInRange = rows.filter((row) =>
    isWithinInterval(parseISO(row.date), { start: range.start, end: range.end }),
  );

  if (rowsInRange.length === 0) {
    return [];
  }

  if (isSingleDayRange(range)) {
    const hourlyRows = rowsInRange.filter((row) => row.granularity === "hour");
    if (hourlyRows.length > 0) {
      return hourlyRows;
    }
  }

  return selectSummaryGranularityForRange(rows, range);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getDayLabel(date: Date) {
  return format(date, "dd/MM", { locale: ptBR });
}

export function getLatestMetricReferenceDate(
  rows: RawCampaignMetric[],
  fallback = new Date(),
) {
  if (rows.length === 0) {
    return fallback;
  }

  let latest = parseISO(rows[0].date);

  for (const row of rows) {
    const current = parseISO(row.date);

    if (current.getTime() > latest.getTime()) {
      latest = current;
    }
  }

  return latest;
}

export function getReferenceNowForPeriod(
  rows: RawCampaignMetric[],
  period: DashboardPeriodValue,
  customRange?: { start: string; end: string },
  now = new Date(),
) {
  void rows;
  void period;
  void customRange;
  return now;
}

export function getDateRangeForPeriod(
  period: DashboardPeriodValue,
  customRange?: { start: string; end: string },
  now = new Date(),
): DateRange {
  const today = startOfDay(now);

  switch (period) {
    case "Hoje":
      return { start: today, end: endOfDay(now) };
    case "Ontem": {
      const yesterday = subDays(today, 1);
      return { start: yesterday, end: endOfDay(yesterday) };
    }
    case "Últimos 7 dias":
      return { start: subDays(today, 6), end: endOfDay(now) };
    case "Últimos 30 dias":
      return { start: subDays(today, 29), end: endOfDay(now) };
    case "Este mês":
      return { start: startOfMonth(now), end: endOfDay(now) };
    case "Mês passado": {
      const previousMonth = subMonths(now, 1);
      return {
        start: startOfMonth(previousMonth),
        end: endOfMonth(previousMonth),
      };
    }
    case "Personalizado": {
      const start = customRange?.start ? parseISO(customRange.start) : today;
      const end = customRange?.end ? parseISO(customRange.end) : now;
      return {
        start: startOfDay(start),
        end: endOfDay(end),
      };
    }
    default:
      return { start: subDays(today, 29), end: endOfDay(now) };
  }
}

export function getPreviousDateRange(range: DateRange): DateRange {
  const diffInMs = range.end.getTime() - range.start.getTime();
  const previousEnd = subDays(range.start, 1);
  const previousStart = new Date(previousEnd.getTime() - diffInMs);
  return {
    start: startOfDay(previousStart),
    end: endOfDay(previousEnd),
  };
}

export function filterMetricsByRange(
  rows: RawCampaignMetric[],
  range: DateRange,
) {
  return selectSummaryGranularityForRange(rows, range);
}

export function summarizeMetrics(rows: RawCampaignMetric[]): MetricTotals {
  const totals = rows.reduce(
    (acc, row) => {
      const leadEquivalent = getLeadEquivalent(row);
      acc.amountSpent += row.amountSpent;
      acc.reach += row.reach;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.results += row.results;
      acc.leads += leadEquivalent;
      acc.resultLabels.push(row.resultLabel);
      acc.roi.push(row.roi);
      acc.frequency.push(row.frequency);
      // Receita estimada da linha (ROAS × gasto) para o ROAS ponderado.
      acc.revenue += row.roas * row.amountSpent;
      // Gasto reconstruído na moeda original (BRL / taxa). Para BRL, taxa = 1.
      acc.amountSpentOriginal +=
        row.exchangeRate && row.exchangeRate > 0
          ? row.amountSpent / row.exchangeRate
          : row.amountSpent;
      return acc;
    },
    {
      amountSpent: 0,
      amountSpentOriginal: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      leads: 0,
      revenue: 0,
      resultLabels: [] as string[],
      roi: [] as number[],
      frequency: [] as number[],
    },
  );

  const currency = resolveCurrency(rows);
  // CPC/CPM na moeda original derivam do gasto original.
  const cpcOriginal = totals.clicks > 0 ? totals.amountSpentOriginal / totals.clicks : 0;
  const cpmOriginal =
    totals.impressions > 0
      ? (totals.amountSpentOriginal / totals.impressions) * 1000
      : 0;
  // Custo por RESULTADO = gasto / resultado principal (não só leads). Cobre
  // campanhas de mensagem/compra, batendo com o "Custo por resultado" da Meta.
  const costPerLeadOriginal =
    totals.results > 0 ? totals.amountSpentOriginal / totals.results : 0;

  return {
    amountSpent: totals.amountSpent,
    reach: totals.reach,
    impressions: totals.impressions,
    clicks: totals.clicks,
    results: totals.results,
    resultLabel: totals.resultLabels[0] ?? "Sem resultado",
    leads: totals.leads,
    ctr:
      totals.impressions > 0
        ? (totals.clicks / totals.impressions) * 100
        : 0,
    cpc: totals.clicks > 0 ? totals.amountSpent / totals.clicks : 0,
    cpm:
      totals.impressions > 0
        ? (totals.amountSpent / totals.impressions) * 1000
        : 0,
    costPerLead:
      totals.results > 0 ? totals.amountSpent / totals.results : 0,
    roi: average(totals.roi),
    // ROAS ponderado pelo gasto (receita total / investimento total) — é assim
    // que a Meta calcula, e não a média simples dos ROAS diários.
    roas: totals.amountSpent > 0 ? totals.revenue / totals.amountSpent : 0,
    frequency: average(totals.frequency),
    currency,
    amountSpentOriginal: totals.amountSpentOriginal,
    cpcOriginal,
    cpmOriginal,
    costPerLeadOriginal,
  };
}

function groupMetricsByKey(
  rows: RawCampaignMetric[],
  getKey: (row: RawCampaignMetric, date: Date) => string,
  getLabel: (row: RawCampaignMetric, date: Date) => string,
) {
  const groups = new Map<
    string,
    {
      date: Date;
      sortValue: number;
      amountSpent: number;
      leads: number;
      label: string;
    }
  >();

  for (const row of rows) {
    const date = parseISO(row.date);
    const key = getKey(row, date);
    const current = groups.get(key);
    const sortValue =
      row.granularity === "hour" && row.hourBucket >= 0
        ? row.hourBucket
        : date.getTime();
    const leadEquivalent = getLeadEquivalent(row);

    if (!current) {
      groups.set(key, {
        date,
        sortValue,
        amountSpent: row.amountSpent,
        leads: leadEquivalent,
        label: getLabel(row, date),
      });
      continue;
    }

    current.amountSpent += row.amountSpent;
    current.leads += leadEquivalent;
  }

  return Array.from(groups.values())
    .sort((a, b) => a.sortValue - b.sortValue)
    .map<PerformancePoint>((item) => ({
      label: item.label,
      amountSpent: Number(item.amountSpent.toFixed(2)),
      leads: Number(item.leads.toFixed(2)),
    }));
}

export function buildPerformanceSeries(
  rows: RawCampaignMetric[],
  period: DashboardPeriodValue,
  customRange?: { start: string; end: string },
  now = new Date(),
): PerformancePoint[] {
  const range = getDateRangeForPeriod(period, customRange, now);
  const filteredRows = selectChartGranularityForRange(rows, range);

  if (filteredRows.length === 0) {
    return [];
  }

  if (period === "Hoje" || period === "Ontem") {
    return groupMetricsByKey(
      filteredRows,
      (row, date) =>
        row.granularity === "hour" && row.hourBucket >= 0
          ? `hour-${row.hourBucket}`
          : format(date, "yyyy-MM-dd"),
      (row, date) =>
        row.granularity === "hour" && row.hourLabel
          ? row.hourLabel
          : getDayLabel(date),
    );
  }

  if (period === "Últimos 7 dias") {
    return groupMetricsByKey(
      filteredRows,
      (_row, date) => format(date, "yyyy-MM-dd"),
      (_row, date) => getDayLabel(date),
    );
  }

  if (period === "Personalizado") {
    const days =
      Math.ceil((range.end.getTime() - range.start.getTime()) / 86400000) + 1;

    if (days <= 14) {
      return groupMetricsByKey(
        filteredRows,
        (_row, date) => format(date, "yyyy-MM-dd"),
        (_row, date) => getDayLabel(date),
      );
    }

    if (days <= 62) {
      return groupMetricsByKey(
        filteredRows,
        (_row, date) => format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        (_row, date) =>
          `Sem ${format(startOfWeek(date, { weekStartsOn: 1 }), "dd/MM", { locale: ptBR })}`,
      );
    }
  }

  if (
    period === "Últimos 30 dias" ||
    period === "Este mês" ||
    period === "Mês passado"
  ) {
    return groupMetricsByKey(
      filteredRows,
      (_row, date) => format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      (_row, date) =>
        `Sem ${format(startOfWeek(date, { weekStartsOn: 1 }), "dd/MM", { locale: ptBR })}`,
    );
  }

  return groupMetricsByKey(
    filteredRows,
    (_row, date) => format(startOfMonth(date), "yyyy-MM"),
    (_row, date) => format(date, "MMM/yy", { locale: ptBR }),
  );
}

export function formatPeriodLabel(
  period: DashboardPeriodValue,
  customRange?: { start: string; end: string },
  now = new Date(),
) {
  if (period !== "Personalizado") {
    return period;
  }

  const range = getDateRangeForPeriod(period, customRange, now);
  return `${format(range.start, "dd/MM/yyyy")} ate ${format(range.end, "dd/MM/yyyy")}`;
}

export function calculateChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) {
      return 0;
    }

    return 100;
  }

  return ((current - previous) / previous) * 100;
}
