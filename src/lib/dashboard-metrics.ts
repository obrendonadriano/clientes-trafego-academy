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
};

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
      acc.amountSpent += row.amountSpent;
      acc.reach += row.reach;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.results += row.results;
      acc.leads += row.leads;
      acc.resultLabels.push(row.resultLabel);
      acc.roi.push(row.roi);
      acc.roas.push(row.roas);
      acc.frequency.push(row.frequency);
      return acc;
    },
    {
      amountSpent: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      leads: 0,
      resultLabels: [] as string[],
      roi: [] as number[],
      roas: [] as number[],
      frequency: [] as number[],
    },
  );

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
      totals.leads > 0 ? totals.amountSpent / totals.leads : 0,
    roi: average(totals.roi),
    roas: average(totals.roas),
    frequency: average(totals.frequency),
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

    if (!current) {
      groups.set(key, {
        date,
        sortValue,
        amountSpent: row.amountSpent,
        leads: row.leads,
        label: getLabel(row, date),
      });
      continue;
    }

    current.amountSpent += row.amountSpent;
    current.leads += row.leads;
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
