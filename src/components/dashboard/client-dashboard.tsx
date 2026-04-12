"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  PeriodFilter,
  type PeriodFilterValue,
} from "@/components/dashboard/period-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildPerformanceSeries,
  calculateChange,
  filterMetricsByRange,
  formatPeriodLabel,
  getDateRangeForPeriod,
  getPreferredLeadCount,
  getPreferredResultCount,
  getPreferredResultLabelForCampaignName,
  getReferenceNowForPeriod,
  getPreviousDateRange,
  summarizeMetrics,
} from "@/lib/dashboard-metrics";
import {
  CampaignWithMetrics,
  RawCampaignMetric,
  ReportHistoryItem,
  SyncStatus,
  User,
} from "@/lib/types";

const PerformanceChart = dynamic(
  () =>
    import("@/components/dashboard/performance-chart").then(
      (module) => module.PerformanceChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-3xl border border-border/60 bg-background/60 p-4">
        <div className="h-[280px] animate-pulse rounded-[1.5rem] bg-muted/70" />
      </div>
    ),
  },
);

type ClientDashboardProps = {
  user: User;
  campaigns: CampaignWithMetrics[];
  metricRows: RawCampaignMetric[];
  reports: ReportHistoryItem[];
  syncStatus: SyncStatus | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
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
  user,
  campaigns,
  metricRows,
  reports,
  syncStatus,
}: ClientDashboardProps) {
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [comparePrevious, setComparePrevious] = useState(true);
  const [customRange, setCustomRange] = useState({
    start: "2026-04-01",
    end: "2026-04-08",
  });

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
        const preferredResultLabel =
          getPreferredResultLabelForCampaignName(campaign.name) ??
          summary.resultLabel;
        const preferredResultCount = getPreferredResultCount(rows, campaign.name);
        const preferredLeadCount = getPreferredLeadCount(rows, campaign.name);

        return {
          ...campaign,
          metrics: {
            ...campaign.metrics,
            amountSpent: formatCurrency(summary.amountSpent),
            clicks: String(Math.round(summary.clicks)),
            ctr: formatPercent(summary.ctr),
            results: String(Math.round(preferredResultCount)),
            resultLabel: preferredResultLabel,
            leads: String(Math.round(preferredLeadCount)),
            costPerLead: formatCurrency(
              preferredLeadCount > 0 ? summary.amountSpent / preferredLeadCount : 0,
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
      hasData: currentRows.length > 0,
      periodLabel: formatPeriodLabel(period, customRange, referenceDate),
      chartData: buildPerformanceSeries(metricRows, period, customRange, referenceDate),
      campaigns: filteredCampaigns,
      leadsChange: calculateChange(totals.leads, previousTotals.leads),
      ctrChange: calculateChange(totals.ctr, previousTotals.ctr),
      cplChange: calculateChange(
        totals.costPerLead,
        previousTotals.costPerLead,
      ),
    };
  }, [campaigns, comparePrevious, customRange, metricRows, period]);

  return (
    <DashboardShell
      user={user}
      title={`Resultados de ${user.clientName}`}
      subtitle="Visualização simples, profissional e restrita às campanhas liberadas para este cliente."
    >
      <div className="space-y-6">
        <div id="visao-geral" className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between scroll-mt-8">
          <PeriodFilter
            active={period}
            onChange={setPeriod}
            comparePrevious={comparePrevious}
            onComparePreviousChange={setComparePrevious}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            onApplyCustomRange={() => setPeriod("Personalizado")}
            maxCustomRangeDays={92}
            customLimitLabel="3 meses"
          />
        </div>

        <div id="metricas" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 scroll-mt-8">
          <MetricCard
            label="Campanhas liberadas"
            value={String(selected.campaigns.length)}
            change={selected.hasData ? "dados reais do período" : "aguardando métricas"}
          />
          <MetricCard
            label="Leads"
            value={String(Math.round(selected.totals.leads))}
            change={comparePrevious ? formatChange(selected.leadsChange) : "período atual"}
            positive={selected.leadsChange >= 0}
          />
          <MetricCard
            label="CTR médio"
            value={formatPercent(selected.totals.ctr)}
            change={comparePrevious ? formatChange(selected.ctrChange) : "período atual"}
            positive={selected.ctrChange >= 0}
          />
          <MetricCard
            label="Custo por lead"
            value={formatCurrency(selected.totals.costPerLead)}
            change={comparePrevious ? formatChange(selected.cplChange) : "período atual"}
            positive={selected.cplChange <= 0}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <PerformanceChart
            data={selected.chartData}
            periodLabel={selected.periodLabel}
            emptyMessage="As métricas desta conta ainda não foram importadas para o período selecionado."
          />
          <Card className="border-border/60 bg-background/60">
            <CardHeader>
              <CardTitle className="font-display text-2xl">
                Visão do período
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Campanhas visíveis: <strong className="text-foreground">{campaigns.length}</strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Campanhas no período: <strong className="text-foreground">{selected.campaigns.length}</strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Investimento total:{" "}
                <strong className="text-foreground">{formatCurrency(selected.totals.amountSpent)}</strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Histórico recente: <strong className="text-foreground">{reports.length} análises</strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Última atualização:{" "}
                <strong className="text-foreground">
                  {formatDateTime(syncStatus?.lastSuccessAt)}
                </strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Próxima atualização:{" "}
                <strong className="text-foreground">
                  {formatDateTime(syncStatus?.nextRunAt)}
                </strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Frequência média:{" "}
                <strong className="text-foreground">
                  {selected.totals.frequency.toFixed(2).replace(".", ",")}
                </strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Melhor ROAS do período:{" "}
                <strong className="text-foreground">
                  {selected.totals.roas.toFixed(2).replace(".", ",")}x
                </strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Filtro atual:{" "}
                <strong className="text-foreground">{selected.periodLabel}</strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Sincronização automática:{" "}
                <strong className="text-foreground">
                  a cada {syncStatus?.intervalMinutes ?? 15} minutos
                </strong>
                <p className="mt-2 text-xs text-muted-foreground">
                  {syncStatus?.message ??
                    "Os dados desta conta são atualizados automaticamente pela integração com a Meta Ads."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
