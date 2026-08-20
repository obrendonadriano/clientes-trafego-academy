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
import { getCurrencyRateToBrl } from "@/lib/meta-ads";
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

function saoPauloIsoDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function summarizeRows(
  rows: RawCampaignMetric[],
  currentRates: ReadonlyMap<string, number>,
) {
  return rows.reduce(
    (accumulator, row) => {
      const currency = (row.currency || "BRL").toUpperCase();
      const isForeign = currency !== "BRL";
      const storedRate = row.exchangeRate && row.exchangeRate > 0 ? row.exchangeRate : 1;
      const amountSpentOriginal = isForeign
        ? row.amountSpent / storedRate
        : row.amountSpent;
      const currentRate = isForeign
        ? currentRates.get(currency) ?? storedRate
        : 1;
      const amountSpent = isForeign
        ? amountSpentOriginal * currentRate
        : row.amountSpent;

      accumulator.amountSpent += amountSpent;
      accumulator.results += row.results;
      accumulator.leads += getLeadEquivalent(row);
      accumulator.clicks += row.clicks;
      accumulator.impressions += row.impressions;
      // Só as linhas em moeda estrangeira entram na reconstrução do valor
      // original — somar as linhas em real aqui misturaria reais com dólares.
      if (isForeign) {
        accumulator.foreignSpent += amountSpent;
        accumulator.amountSpentOriginal += amountSpentOriginal;
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
  // Fechamento é cobrança, então usa somente dias consolidados. A Meta expõe
  // valores intradiários no endpoint "Hoje", mas ainda não os inclui no total
  // consolidado do Gerenciador; somá-los aqui fazia o fechamento ficar maior.
  const currentDay = saoPauloIsoDay();
  const metricRows = dedupeMetricRowsByDay(source.metricRows).filter(
    (row) => row.date < currentDay,
  );
  const foreignCurrencies = [
    ...new Set(
      metricRows
        .map((row) => (row.currency || "BRL").toUpperCase())
        .filter((currency) => currency !== "BRL"),
    ),
  ];
  // O fechamento usa uma única cotação atual por moeda, como no conversor de
  // dólar. O valor original é reconstruído pela taxa gravada em cada linha.
  const currentRates = new Map(
    await Promise.all(
      foreignCurrencies.map(async (currency) => [
        currency,
        await getCurrencyRateToBrl(currency),
      ] as const),
    ),
  );
  const rowsByCampaign = new Map<string, RawCampaignMetric[]>();

  for (const row of metricRows) {
    const items = rowsByCampaign.get(row.campaignId) ?? [];
    items.push(row);
    rowsByCampaign.set(row.campaignId, items);
  }

  const campaigns: ClosingCampaignRow[] = source.campaigns
    .map((campaign) => {
      const rows = rowsByCampaign.get(campaign.id) ?? [];
      const totals = summarizeRows(rows, currentRates);

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

  const overall = summarizeRows(metricRows, currentRates);
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
    // Cotação atual média ponderada: gasto convertido da parcela estrangeira
    // dividido pelo gasto dela na moeda original. Contas em real ficam de fora.
    averageRate:
      overall.amountSpentOriginal > 0
        ? overall.foreignSpent / overall.amountSpentOriginal
        : 1,
    generatedAt: new Date().toISOString(),
  };
}
