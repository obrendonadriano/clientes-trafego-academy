import { format, parseISO } from "date-fns";
import {
  dedupeMetricRowsByDay,
  getLeadEquivalent,
  hasMixedCurrencies,
  resolveCurrency,
} from "@/lib/dashboard-metrics";
import type { MetricsWindow } from "@/lib/data/date-range";
import { clampMetricsWindowForRole } from "@/lib/data/date-range";
import { getClosingSourceData } from "@/lib/data/queries";
import { breakdownMetaTaxes, type TaxBreakdown } from "@/lib/taxes";
import type { RawCampaignMetric, User } from "@/lib/types";

// O fechamento é o documento de cobrança do período: soma a veiculação de cada
// campanha, aplica os impostos da Meta e mostra o total em reais. Diferente do
// painel, os totais aqui são calculados no SERVIDOR sobre a janela exata
// pedida, para o PDF e a tela nunca divergirem.

export type ClosingCampaignRow = {
  id: string;
  name: string;
  clientName?: string;
  status: string;
  amountSpent: number;
  results: number;
  resultLabel: string;
  costPerResult: number;
  clicks: number;
  impressions: number;
};

export type ClosingData = {
  window: MetricsWindow;
  periodLabel: string;
  dayCount: number;
  clientName: string;
  campaigns: ClosingCampaignRow[];
  taxes: TaxBreakdown;
  results: number;
  clicks: number;
  impressions: number;
  // Preenchido só quando há gasto em moeda estrangeira no período.
  currency: string;
  // Gasto na moeda original — SÓ da parcela estrangeira.
  amountSpentOriginal: number;
  // Quanto do total (em BRL) veio de contas em moeda estrangeira.
  foreignSpent: number;
  averageRate: number;
  // true quando o período junta contas em real e em moeda estrangeira: aí não
  // existe "total na moeda original", só a parcela estrangeira.
  mixedCurrencies: boolean;
  generatedAt: string;
};

function formatDay(value: string) {
  try {
    return format(parseISO(value), "dd/MM/yyyy");
  } catch {
    return value;
  }
}

function countDays(window: MetricsWindow) {
  const start = parseISO(window.startDate).getTime();
  const end = parseISO(window.endDate).getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function summarizeRows(rows: RawCampaignMetric[]) {
  return rows.reduce(
    (accumulator, row) => {
      accumulator.amountSpent += row.amountSpent;
      accumulator.results += row.results;
      accumulator.leads += getLeadEquivalent(row);
      accumulator.clicks += row.clicks;
      accumulator.impressions += row.impressions;
      // Só as linhas em moeda estrangeira entram na reconstrução do valor
      // original — somar as linhas em real aqui misturaria reais com dólares.
      if ((row.currency || "BRL").toUpperCase() !== "BRL") {
        accumulator.foreignSpent += row.amountSpent;
        accumulator.amountSpentOriginal +=
          row.exchangeRate && row.exchangeRate > 0
            ? row.amountSpent / row.exchangeRate
            : row.amountSpent;
      }
      return accumulator;
    },
    {
      amountSpent: 0,
      results: 0,
      leads: 0,
      clicks: 0,
      impressions: 0,
      amountSpentOriginal: 0,
      foreignSpent: 0,
    },
  );
}

export async function getClosingData(
  user: User,
  requestedWindow: MetricsWindow,
  clientId?: string | null,
): Promise<ClosingData> {
  // Cliente nunca recebe mais do que o limite do papel dele, mesmo pela URL.
  const window = clampMetricsWindowForRole(user.role, requestedWindow);
  const source = await getClosingSourceData(user, window, clientId);

  // Sem isso o mesmo dia entraria duas vezes (linha diária + linhas horárias)
  // e o fechamento cobraria quase o dobro.
  const metricRows = dedupeMetricRowsByDay(source.metricRows);
  const rowsByCampaign = new Map<string, RawCampaignMetric[]>();

  for (const row of metricRows) {
    const items = rowsByCampaign.get(row.campaignId) ?? [];
    items.push(row);
    rowsByCampaign.set(row.campaignId, items);
  }

  const campaigns: ClosingCampaignRow[] = source.campaigns
    .map((campaign) => {
      const rows = rowsByCampaign.get(campaign.id) ?? [];
      const totals = summarizeRows(rows);

      return {
        id: campaign.id,
        name: campaign.name,
        clientName: campaign.clientName,
        status: campaign.status,
        amountSpent: totals.amountSpent,
        results: totals.results,
        resultLabel: rows[0]?.resultLabel ?? campaign.metrics.resultLabel,
        costPerResult:
          totals.results > 0 ? totals.amountSpent / totals.results : 0,
        clicks: totals.clicks,
        impressions: totals.impressions,
      };
    })
    // Campanha sem gasto no período não entra no fechamento.
    .filter((campaign) => campaign.amountSpent > 0)
    .sort((a, b) => b.amountSpent - a.amountSpent);

  const overall = summarizeRows(metricRows);
  const currency = resolveCurrency(metricRows);

  return {
    window,
    periodLabel: `${formatDay(window.startDate)} a ${formatDay(window.endDate)}`,
    dayCount: countDays(window),
    clientName: source.clientName,
    campaigns,
    taxes: breakdownMetaTaxes(overall.amountSpent),
    results: overall.results,
    clicks: overall.clicks,
    impressions: overall.impressions,
    currency,
    amountSpentOriginal: overall.amountSpentOriginal,
    foreignSpent: overall.foreignSpent,
    mixedCurrencies: hasMixedCurrencies(metricRows),
    // Cotação média ponderada: gasto convertido da parcela estrangeira dividido
    // pelo gasto dela na moeda original. Usar o total (com as contas em real
    // junto) dava uma "cotação" muito abaixo da real.
    averageRate:
      overall.amountSpentOriginal > 0
        ? overall.foreignSpent / overall.amountSpentOriginal
        : 1,
    generatedAt: new Date().toISOString(),
  };
}
