"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { TaxInfo } from "@/components/dashboard/tax-info";
import { usePeriodScope } from "@/components/shell/period-scope";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildPerformanceSeries,
  calculateChange,
  filterMetricsByRange,
  formatMoney,
  formatPeriodLabel,
  getDateRangeForPeriod,
  getReferenceNowForPeriod,
  getPreviousDateRange,
  summarizeMetrics,
} from "@/lib/dashboard-metrics";
import { RawCampaignMetric } from "@/lib/types";
import { cn } from "@/lib/utils";

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

// Sub-abas da secao "Visao": os KPIs aparecem nas duas, o que muda e o
// grafico principal (curva do periodo x comparativo com o periodo anterior).
export type AdminOverviewView = "geral" | "comparativo";

type AdminOverviewProps = {
  view?: AdminOverviewView;
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
  view = "geral",
  metricRows,
}: AdminOverviewProps) {
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
          // Exibe com impostos; a comparação segue sobre o valor puro (a
          // proporção é a mesma, então a variação % não muda).
          hasTax: true,
          value: formatCurrency(totals.amountSpentWithTax),
          sub:
            totals.currency !== "BRL"
              ? formatMoney(totals.amountSpentOriginalWithTax, totals.currency)
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
          hasTax: false,
          value: String(Math.round(totals.leads)),
          sub: undefined,
          change: comparePrevious
            ? formatChange(calculateChange(totals.leads, previousTotals.leads))
            : "período atual",
          positive: totals.leads >= previousTotals.leads,
        },
        {
          label: "CTR médio",
          hasTax: false,
          value: formatPercent(totals.ctr),
          sub: undefined,
          change: comparePrevious
            ? formatChange(calculateChange(totals.ctr, previousTotals.ctr))
            : "período atual",
          positive: totals.ctr >= previousTotals.ctr,
        },
        {
          label: "ROAS médio",
          hasTax: false,
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
    <div className="space-y-[1.05rem]">
      <div className="grid gap-px overflow-hidden rounded-[0.875rem] border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {selected.cards.map((card) => (
          <div
            key={card.label}
            className="bg-card p-[1.05rem] text-foreground"
          >
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {card.label}
              {card.hasTax ? <TaxInfo /> : null}
            </p>
            <p className="mt-2 whitespace-nowrap font-display text-[clamp(1.7rem,1.8vw,2rem)] font-medium leading-none">
              {card.value}
            </p>
            <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs">
              <span
                className={cn(
                  "truncate",
                  card.positive ? "text-emerald-400" : "text-destructive",
                )}
              >
                {card.change}
              </span>
              {card.sub ? (
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {card.sub}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {view === "comparativo" ? (
        comparePrevious ? (
          <DashboardChart
            kind="comparison"
            current={selected.totals}
            previous={selected.previousTotals}
            periodLabel={selected.periodLabel}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              A comparação está desligada. Abra o seletor de período na barra
              superior e escolha <strong className="text-foreground">Período
              anterior</strong> para ver este gráfico.
            </CardContent>
          </Card>
        )
      ) : (
        <DashboardChart
          kind="performance"
          data={selected.chart}
          periodLabel={selected.periodLabel}
          emptyMessage="Importe métricas da Meta Ads para visualizar a curva real de investimento e resultados."
        />
      )}
    </div>
  );
}
