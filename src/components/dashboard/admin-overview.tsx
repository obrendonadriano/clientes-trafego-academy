"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
  Activity,
  Coins,
  FileText,
  MousePointerClick,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  FunnelBars,
  Panel,
  PanelLink,
  PulseLink,
  PulsePanel,
} from "@/components/dashboard/overview-panels";
import { TaxInfo } from "@/components/dashboard/tax-info";
import { usePeriodScope, useScopedHref } from "@/components/shell/period-scope";
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

const DashboardChart = dynamic(
  () =>
    import("@/components/dashboard/dashboard-chart").then(
      (module) => module.DashboardChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[18px] border border-border bg-card p-6">
        <div className="skeleton-shimmer h-[292px] rounded-xl" />
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
  // Contadores da carteira para o card "Pulso da operação".
  counts?: {
    clientCount: number;
    activeClientCount: number;
    campaignCount: number;
    activeCampaignCount: number;
  };
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

function formatInt(value: number) {
  return Math.round(value).toLocaleString("pt-BR");
}

export function AdminOverview({
  view = "geral",
  metricRows,
  counts,
}: AdminOverviewProps) {
  const scopedHref = useScopedHref();
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
          label: "Investimento",
          icon: Wallet,
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
          icon: Target,
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
          icon: MousePointerClick,
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
          icon: TrendingUp,
          hasTax: false,
          value: formatMultiplier(totals.roas),
          sub: undefined,
          change: comparePrevious
            ? formatChange(calculateChange(totals.roas, previousTotals.roas))
            : "período atual",
          positive: totals.roas >= previousTotals.roas,
        },
        {
          label: "Custo por resultado",
          icon: Coins,
          hasTax: false,
          value: formatCurrency(totals.costPerLead),
          sub: undefined,
          change: comparePrevious
            ? formatChange(
                calculateChange(totals.costPerLead, previousTotals.costPerLead),
              )
            : "período atual",
          positive: totals.costPerLead <= previousTotals.costPerLead,
        },
        {
          label: "Cliques",
          icon: Activity,
          hasTax: false,
          value: formatInt(totals.clicks),
          sub: undefined,
          change: comparePrevious
            ? formatChange(calculateChange(totals.clicks, previousTotals.clicks))
            : "período atual",
          positive: totals.clicks >= previousTotals.clicks,
        },
      ],
      chart,
    };
  }, [comparePrevious, customRange, metricRows, period]);

  const { totals } = selected;
  const periodText = selected.periodLabel.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 min-[1680px]:grid-cols-6">
        {selected.cards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            icon={card.icon}
            info={card.hasTax ? <TaxInfo /> : undefined}
            value={card.value}
            change={card.change}
            positive={card.positive}
            sub={card.sub}
          />
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
        <>
          <div className="flex flex-wrap gap-5">
            <Panel
              className="flex-[1.7_1_520px]"
              title="Funil das campanhas"
              subtitle={`Da impressão ao resultado · ${periodText}`}
              action={<PanelLink href={scopedHref("/admin/campanhas")}>Ver campanhas</PanelLink>}
            >
              {selected.hasData ? (
                <FunnelBars
                  steps={[
                    { label: "Impressões", value: totals.impressions },
                    { label: "Cliques", value: totals.clicks },
                    { label: "Resultados", value: totals.results },
                  ]}
                />
              ) : (
                <p className="rounded-xl border border-dashed border-input bg-surface-2 px-6 py-10 text-center text-sm text-muted-foreground">
                  Importe métricas da Meta Ads para visualizar o funil do período.
                </p>
              )}
            </Panel>

            <div className="flex min-w-0 flex-[1_1_320px]">
              <PulsePanel
                stamp={selected.periodLabel}
                lines={[
                  ...(counts
                    ? [
                        {
                          strong: `${counts.activeClientCount} de ${counts.clientCount}`,
                          after: " clientes ativos na carteira.",
                        },
                        {
                          strong: `${counts.activeCampaignCount} campanhas ativas`,
                          after: ` de ${counts.campaignCount} sincronizadas.`,
                        },
                      ]
                    : []),
                  {
                    before: "Investimento de ",
                    strong: formatCurrency(totals.amountSpentWithTax),
                    after: ` · ${periodText}.`,
                  },
                  {
                    strong: `${formatInt(totals.results)} resultados`,
                    after: ` a ${formatCurrency(totals.costPerLead)} cada, em média.`,
                  },
                  {
                    before: "CTR médio de ",
                    strong: formatPercent(totals.ctr),
                    after: ` em ${formatInt(totals.impressions)} impressões.`,
                  },
                ]}
                footer={
                  <>
                    <PulseLink href={scopedHref("/admin/clientes")}>
                      <Users className="size-[15px] text-brand-300" strokeWidth={1.75} />
                      Clientes
                    </PulseLink>
                    <PulseLink href={scopedHref("/admin/relatorios-ia")}>
                      <FileText className="size-[15px] text-brand-300" strokeWidth={1.75} />
                      Relatórios IA
                    </PulseLink>
                  </>
                }
              />
            </div>
          </div>

          <DashboardChart
            kind="performance"
            data={selected.chart}
            periodLabel={selected.periodLabel}
            emptyMessage="Importe métricas da Meta Ads para visualizar a curva real de investimento e resultados."
          />
        </>
      )}
    </div>
  );
}
