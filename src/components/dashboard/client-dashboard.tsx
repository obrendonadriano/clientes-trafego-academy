"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { TaxInfo } from "@/components/dashboard/tax-info";
import { usePeriodScope } from "@/components/shell/period-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildPerformanceSeries,
  calculateChange,
  filterMetricsByRange,
  formatMoney,
  formatPeriodLabel,
  getDateRangeForPeriod,
  getReferenceNowForPeriod,
  getPreviousDateRange,
  sumResults,
  summarizeMetrics,
} from "@/lib/dashboard-metrics";
import {
  CampaignWithMetrics,
  RawCampaignMetric,
  SyncStatus,
} from "@/lib/types";

const DashboardChart = dynamic(
  () =>
    import("@/components/dashboard/dashboard-chart").then(
      (module) => module.DashboardChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="dashboard-card rounded-[1.5rem] border p-4">
        <div className="h-[280px] animate-pulse rounded-[1.25rem] bg-muted/70 dark:bg-white/[0.08]" />
      </div>
    ),
  },
);

type ClientDashboardProps = {
  campaigns: CampaignWithMetrics[];
  metricRows: RawCampaignMetric[];
  syncStatus: SyncStatus | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

// Valor na moeda estrangeira (ex.: "US$ 39,14") quando a conta não é em BRL.
function foreignSub(value: number, currency: string) {
  return currency && currency !== "BRL" ? formatMoney(value, currency) : undefined;
}

function formatPercent(value: number) {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

function formatChange(value: number, suffix = "%") {
  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(1).replace(".", ",")}${suffix}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Aguardando primeira sincronização";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function ClientDashboard({
  campaigns,
  metricRows,
  syncStatus,
}: ClientDashboardProps) {
  const scope = usePeriodScope();
  const { period, customRange, comparePrevious } = scope;

  const selected = useMemo(() => {
    const referenceDate = getReferenceNowForPeriod(metricRows, period, customRange);
    const range = getDateRangeForPeriod(period, customRange, referenceDate);
    const previousRange = getPreviousDateRange(range);
    const currentRows = filterMetricsByRange(metricRows, range);
    const previousRows = comparePrevious
      ? filterMetricsByRange(metricRows, previousRange)
      : [];
    const totals = summarizeMetrics(currentRows);
    const previousTotals = summarizeMetrics(previousRows);
    const metricsByCampaign = new Map<string, RawCampaignMetric[]>();

    for (const row of currentRows) {
      const items = metricsByCampaign.get(row.campaignId) ?? [];
      items.push(row);
      metricsByCampaign.set(row.campaignId, items);
    }

    const filteredCampaigns = campaigns
      .map((campaign) => {
        const rows = metricsByCampaign.get(campaign.id) ?? [];
        const summary = summarizeMetrics(rows);
        // Resultado vem do que o sync gravou (definido pelo objetivo); o rótulo
        // vem da categoria da campanha ou do label agregado já calculado.
        const resultCount = sumResults(rows);
        const resultLabel = campaign.metrics.resultLabel;

        return {
          ...campaign,
          metrics: {
            ...campaign.metrics,
            amountSpent: formatCurrency(summary.amountSpentWithTax),
            clicks: String(Math.round(summary.clicks)),
            ctr: formatPercent(summary.ctr),
            results: String(Math.round(resultCount)),
            resultLabel,
            leads: String(Math.round(resultCount)),
            costPerLead: formatCurrency(
              resultCount > 0 ? summary.amountSpent / resultCount : 0,
            ),
            roas: `${summary.roas.toFixed(2).replace(".", ",")}x`,
            periodLabel: formatPeriodLabel(period, customRange, referenceDate),
          },
          metricCount: rows.length,
        };
      })
      .filter((campaign) => campaign.metricCount > 0);

    return {
      totals,
      previousTotals,
      hasData: currentRows.length > 0,
      periodLabel: formatPeriodLabel(period, customRange, referenceDate),
      chartData: buildPerformanceSeries(metricRows, period, customRange, referenceDate),
      campaigns: filteredCampaigns,
      resultsChange: calculateChange(totals.results, previousTotals.results),
      ctrChange: calculateChange(totals.ctr, previousTotals.ctr),
      cplChange: calculateChange(
        totals.costPerLead,
        previousTotals.costPerLead,
      ),
    };
  }, [campaigns, comparePrevious, customRange, metricRows, period]);

  return (
    <div className="space-y-6">
        <div id="visao-geral" className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between scroll-mt-8">
        </div>

        <div id="metricas" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 scroll-mt-8">
          <MetricCard
            label="Campanhas liberadas"
            value={String(selected.campaigns.length)}
            change={selected.hasData ? "dados reais do período" : "aguardando métricas"}
          />
          <MetricCard
            label="Resultados"
            value={String(Math.round(selected.totals.results))}
            change={comparePrevious ? formatChange(selected.resultsChange) : "período atual"}
            positive={selected.resultsChange >= 0}
          />
          <MetricCard
            label="CTR médio"
            value={formatPercent(selected.totals.ctr)}
            change={comparePrevious ? formatChange(selected.ctrChange) : "período atual"}
            positive={selected.ctrChange >= 0}
          />
          <MetricCard
            label="Custo por resultado"
            value={formatCurrency(selected.totals.costPerLead)}
            sub={foreignSub(selected.totals.costPerLeadOriginal, selected.totals.currency)}
            change={comparePrevious ? formatChange(selected.cplChange) : "período atual"}
            positive={selected.cplChange <= 0}
          />
        </div>

        {comparePrevious ? (
          <DashboardChart
            kind="comparison"
            current={selected.totals}
            previous={selected.previousTotals}
            periodLabel={selected.periodLabel}
          />
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <DashboardChart
            kind="performance"
            data={selected.chartData}
            periodLabel={selected.periodLabel}
            emptyMessage="As métricas desta conta ainda não foram importadas para o período selecionado."
          />
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl">
                Visão do período
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
              <div className="dashboard-row rounded-2xl border px-4 py-3">
                Campanhas visíveis: <strong className="text-foreground">{campaigns.length}</strong>
              </div>
              <div className="dashboard-row rounded-2xl border px-4 py-3">
                Campanhas no período: <strong className="text-foreground">{selected.campaigns.length}</strong>
              </div>
              <div className="dashboard-row rounded-2xl border px-4 py-3">
                Investimento total:{" "}
                <strong className="text-foreground">
                  {formatCurrency(selected.totals.amountSpentWithTax)}
                </strong>
                <TaxInfo className="ml-1 align-text-bottom" />
                {foreignSub(selected.totals.amountSpentOriginalWithTax, selected.totals.currency) ? (
                  <span className="ml-1 text-xs">
                    ({foreignSub(selected.totals.amountSpentOriginalWithTax, selected.totals.currency)})
                  </span>
                ) : null}
              </div>
              <div className="dashboard-row rounded-2xl border px-4 py-3">
                Última atualização:{" "}
                <strong className="text-foreground">
                  {formatDateTime(syncStatus?.lastSuccessAt)}
                </strong>
              </div>
              <div className="dashboard-row rounded-2xl border px-4 py-3">
                Frequência média:{" "}
                <strong className="text-foreground">
                  {selected.totals.frequency.toFixed(2).replace(".", ",")}
                </strong>
              </div>
              <div className="dashboard-row rounded-2xl border px-4 py-3">
                Melhor ROAS do período:{" "}
                <strong className="text-foreground">
                  {selected.totals.roas.toFixed(2).replace(".", ",")}x
                </strong>
              </div>
              <div className="dashboard-row rounded-2xl border px-4 py-3">
                Filtro atual:{" "}
                <strong className="text-foreground">{selected.periodLabel}</strong>
              </div>
              <div className="dashboard-row rounded-2xl border px-4 py-3">
                Atualização dos dados: {" "}
                <strong className="text-foreground">manual</strong>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {syncStatus?.message ??
                    "Use o botão Atualizar métricas na página de campanhas para consultar os dados mais recentes da Meta Ads."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
    </div>
  );
}
