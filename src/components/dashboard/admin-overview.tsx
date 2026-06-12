"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
  formatMoney,
  formatPeriodLabel,
  getDateRangeForPeriod,
  getDefaultCustomRange,
  getReferenceNowForPeriod,
  getPreviousDateRange,
  summarizeMetrics,
} from "@/lib/dashboard-metrics";
import { RawCampaignMetric } from "@/lib/types";

const PerformanceChart = dynamic(
  () =>
    import("@/components/dashboard/performance-chart").then(
      (module) => module.PerformanceChart,
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

const ComparisonChart = dynamic(
  () =>
    import("@/components/dashboard/comparison-chart").then(
      (module) => module.ComparisonChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="dashboard-card rounded-[1.5rem] border p-4">
        <div className="h-[260px] animate-pulse rounded-[1.25rem] bg-muted/70 dark:bg-white/[0.08]" />
      </div>
    ),
  },
);

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
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [comparePrevious, setComparePrevious] = useState(true);
  const [customRange, setCustomRange] = useState(() => getDefaultCustomRange());

  // Range custom pode ir além da janela padrão carregada (92 dias): sincroniza
  // a URL para o servidor refazer a busca com o período completo.
  function handleApplyCustomRange() {
    setPeriod("Personalizado");
    startTransition(() => {
      router.replace(
        `${pathname}?start=${customRange.start}&end=${customRange.end}`,
        { scroll: false },
      );
    });
  }

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
    const periodLabel = formatPeriodLabel(period, customRange, referenceDate);
    const chart = buildPerformanceSeries(metricRows, period, customRange, referenceDate);

    return {
      periodLabel,
      hasData: currentRows.length > 0,
      totals,
      previousTotals,
      hasPreviousData: previousRows.length > 0,
      cards: [
        {
          label: "Investimento total",
          value: formatCurrency(totals.amountSpent),
          sub:
            totals.currency !== "BRL"
              ? formatMoney(totals.amountSpentOriginal, totals.currency)
              : undefined,
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
          sub: undefined,
          change: comparePrevious
            ? formatChange(calculateChange(totals.leads, previousTotals.leads))
            : "período atual",
          positive: totals.leads >= previousTotals.leads,
        },
        {
          label: "CTR médio",
          value: formatPercent(totals.ctr),
          sub: undefined,
          change: comparePrevious
            ? formatChange(calculateChange(totals.ctr, previousTotals.ctr))
            : "período atual",
          positive: totals.ctr >= previousTotals.ctr,
        },
        {
          label: "ROAS médio",
          value: formatMultiplier(totals.roas),
          sub: undefined,
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
        onApplyCustomRange={handleApplyCustomRange}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {selected.cards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            sub={card.sub}
            change={card.change}
            positive={card.positive}
          />
        ))}
      </div>

      {comparePrevious ? (
        <ComparisonChart
          current={selected.totals}
          previous={selected.previousTotals}
          periodLabel={selected.periodLabel}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <PerformanceChart
          data={selected.chart}
          periodLabel={selected.periodLabel}
          emptyMessage="Importe métricas da Meta Ads para visualizar a curva real de investimento e resultados."
        />
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              Situação da operação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <div className="dashboard-row rounded-2xl border px-4 py-3">
              Clientes ativos:{" "}
              <strong className="text-foreground">{activeClientCount}</strong>
            </div>
            <div className="dashboard-row rounded-2xl border px-4 py-3">
              Campanhas ativas:{" "}
              <strong className="text-foreground">{activeCampaignCount}</strong>
            </div>
            <div className="dashboard-row rounded-2xl border px-4 py-3">
              Clientes com acesso:{" "}
              <strong className="text-foreground">{clientUserCount}</strong>
            </div>
            <div className="dashboard-row rounded-2xl border px-4 py-3">
              Campanhas cadastradas:{" "}
              <strong className="text-foreground">{campaignCount}</strong>
            </div>
            <div className="dashboard-row rounded-2xl border px-4 py-3">
              Permissões ativas:{" "}
              <strong className="text-foreground">{permissionCount}</strong>
            </div>
            <div className="dashboard-row rounded-2xl border px-4 py-3">
              Clientes cadastrados:{" "}
              <strong className="text-foreground">{clientCount}</strong>
            </div>
            <div className="dashboard-row rounded-2xl border px-4 py-3">
              Filtro atual:{" "}
              <strong className="text-foreground">{selected.periodLabel}</strong>
            </div>
            <div className="dashboard-row rounded-2xl border px-4 py-3">
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
