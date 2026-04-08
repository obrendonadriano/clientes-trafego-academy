"use client";

import { useMemo, useState } from "react";
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
import { RawCampaignMetric } from "@/lib/types";

type AdminOverviewProps = {
  clientCount: number;
  campaignCount: number;
  clientUserCount: number;
  permissionCount: number;
  activeClientCount: number;
  activeCampaignCount: number;
  metricRows: RawCampaignMetric[];
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

function formatMultiplier(value: number) {
  return `${value.toFixed(2).replace(".", ",")}x`;
}

function formatChange(value: number, suffix = "%") {
  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(1).replace(".", ",")}${suffix}`;
}

export function AdminOverview({
  clientCount,
  campaignCount,
  clientUserCount,
  permissionCount,
  activeClientCount,
  activeCampaignCount,
  metricRows,
}: AdminOverviewProps) {
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
    const periodLabel = formatPeriodLabel(period, customRange);
    const chart = buildPerformanceSeries(metricRows, period, customRange);

    return {
      periodLabel,
      hasData: currentRows.length > 0,
      totals,
      cards: [
        {
          label: "Investimento total",
          value: formatCurrency(totals.amountSpent),
          change: comparePrevious
            ? formatChange(
                calculateChange(totals.amountSpent, previousTotals.amountSpent),
              )
            : "período atual",
          positive: totals.amountSpent >= previousTotals.amountSpent,
        },
        {
          label: "Leads gerados",
          value: String(Math.round(totals.leads)),
          change: comparePrevious
            ? formatChange(calculateChange(totals.leads, previousTotals.leads))
            : "período atual",
          positive: totals.leads >= previousTotals.leads,
        },
        {
          label: "CTR médio",
          value: formatPercent(totals.ctr),
          change: comparePrevious
            ? formatChange(calculateChange(totals.ctr, previousTotals.ctr))
            : "período atual",
          positive: totals.ctr >= previousTotals.ctr,
        },
        {
          label: "ROAS médio",
          value: formatMultiplier(totals.roas),
          change: comparePrevious
            ? formatChange(calculateChange(totals.roas, previousTotals.roas))
            : "período atual",
          positive: totals.roas >= previousTotals.roas,
        },
      ],
      chart,
    };
  }, [comparePrevious, customRange, metricRows, period]);

  return (
    <div className="space-y-6">
      <PeriodFilter
        active={period}
        onChange={setPeriod}
        comparePrevious={comparePrevious}
        onComparePreviousChange={setComparePrevious}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        onApplyCustomRange={() => setPeriod("Personalizado")}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {selected.cards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            change={card.change}
            positive={card.positive}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <PerformanceChart
          data={selected.chart}
          periodLabel={selected.periodLabel}
          emptyMessage="Importe métricas da Meta Ads para visualizar a curva real de investimento e leads."
        />
        <Card className="border-border/60 bg-background/60">
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              Situação da operação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              Clientes ativos:{" "}
              <strong className="text-foreground">{activeClientCount}</strong>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              Campanhas ativas:{" "}
              <strong className="text-foreground">{activeCampaignCount}</strong>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              Clientes com acesso:{" "}
              <strong className="text-foreground">{clientUserCount}</strong>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              Campanhas cadastradas:{" "}
              <strong className="text-foreground">{campaignCount}</strong>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              Permissões ativas:{" "}
              <strong className="text-foreground">{permissionCount}</strong>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              Clientes cadastrados:{" "}
              <strong className="text-foreground">{clientCount}</strong>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              Filtro atual:{" "}
              <strong className="text-foreground">{selected.periodLabel}</strong>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
              Status das métricas:{" "}
              <strong className="text-foreground">
                {selected.hasData ? "dados reais importados" : "sem métricas no período"}
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
