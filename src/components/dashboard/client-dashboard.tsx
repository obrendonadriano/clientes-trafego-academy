"use client";

import { useMemo, useState } from "react";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import { DashboardShell } from "@/components/dashboard/shell";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
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
  getPreviousDateRange,
  summarizeMetrics,
} from "@/lib/dashboard-metrics";
import {
  CampaignWithMetrics,
  RawCampaignMetric,
  ReportHistoryItem,
  User,
} from "@/lib/types";

type ClientDashboardProps = {
  user: User;
  campaigns: CampaignWithMetrics[];
  metricRows: RawCampaignMetric[];
  reports: ReportHistoryItem[];
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

export function ClientDashboard({
  user,
  campaigns,
  metricRows,
  reports,
}: ClientDashboardProps) {
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [comparePrevious, setComparePrevious] = useState(true);
  const [customRange, setCustomRange] = useState({
    start: "2026-04-01",
    end: "2026-04-08",
  });

  const selected = useMemo(() => {
    const range = getDateRangeForPeriod(period, customRange);
    const previousRange = getPreviousDateRange(range);
    const currentRows = filterMetricsByRange(metricRows, range);
    const previousRows = comparePrevious
      ? filterMetricsByRange(metricRows, previousRange)
      : [];
    const totals = summarizeMetrics(currentRows);
    const previousTotals = summarizeMetrics(previousRows);

    return {
      totals,
      hasData: currentRows.length > 0,
      periodLabel: formatPeriodLabel(period, customRange),
      chartData: buildPerformanceSeries(metricRows, period, customRange),
      leadsChange: calculateChange(totals.leads, previousTotals.leads),
      ctrChange: calculateChange(totals.ctr, previousTotals.ctr),
      cplChange: calculateChange(
        totals.costPerLead,
        previousTotals.costPerLead,
      ),
    };
  }, [comparePrevious, customRange, metricRows, period]);

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
          />
        </div>

        <div id="metricas" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 scroll-mt-8">
          <MetricCard
            label="Campanhas liberadas"
            value={String(campaigns.length)}
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

        <div id="comparativos" className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr] scroll-mt-8">
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
                Investimento total:{" "}
                <strong className="text-foreground">{formatCurrency(selected.totals.amountSpent)}</strong>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
                Histórico recente: <strong className="text-foreground">{reports.length} análises</strong>
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
            </CardContent>
          </Card>
        </div>

        <div id="campanhas" className="scroll-mt-8">
          <CampaignsTable campaigns={campaigns} />
        </div>
      </div>
    </DashboardShell>
  );
}
