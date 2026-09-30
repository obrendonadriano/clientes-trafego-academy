"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
  Activity,
  Coins,
  Eye,
  Megaphone,
  MousePointerClick,
  Radio,
  RefreshCw,
  Repeat,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  CampaignRankTable,
  FunnelBars,
  Panel,
  PanelLink,
  PulseLink,
  PulsePanel,
} from "@/components/dashboard/overview-panels";
import { TaxInfo } from "@/components/dashboard/tax-info";
import { usePeriodScope, useScopedHref } from "@/components/shell/period-scope";
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
      <div className="rounded-[18px] border border-border bg-card p-6">
        <div className="skeleton-shimmer h-[292px] rounded-xl" />
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

function formatInt(value: number) {
  return Math.round(value).toLocaleString("pt-BR");
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
          spentValue: summary.amountSpentWithTax,
        };
      })
      .filter((campaign) => campaign.metricCount > 0);

    const totalSpent = filteredCampaigns.reduce(
      (sum, campaign) => sum + campaign.spentValue,
      0,
    );
    const rankRows = [...filteredCampaigns]
      .sort((a, b) => b.spentValue - a.spentValue)
      .slice(0, 6)
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        spent: campaign.metrics.amountSpent,
        results: campaign.metrics.results,
        resultLabel: campaign.metrics.resultLabel,
        cost: campaign.metrics.costPerLead,
        ctr: campaign.metrics.ctr,
        share: totalSpent > 0 ? (campaign.spentValue / totalSpent) * 100 : 0,
      }));

    return {
      totals,
      previousTotals,
      hasData: currentRows.length > 0,
      periodLabel: formatPeriodLabel(period, customRange, referenceDate),
      chartData: buildPerformanceSeries(metricRows, period, customRange, referenceDate),
      campaigns: filteredCampaigns,
      rankRows,
      spentChange: calculateChange(totals.amountSpent, previousTotals.amountSpent),
      clicksChange: calculateChange(totals.clicks, previousTotals.clicks),
      impressionsChange: calculateChange(
        totals.impressions,
        previousTotals.impressions,
      ),
      resultsChange: calculateChange(totals.results, previousTotals.results),
      ctrChange: calculateChange(totals.ctr, previousTotals.ctr),
      cplChange: calculateChange(
        totals.costPerLead,
        previousTotals.costPerLead,
      ),
    };
  }, [campaigns, comparePrevious, customRange, metricRows, period]);

  const scopedHref = useScopedHref();
  const delta = (value: number) =>
    comparePrevious ? formatChange(value) : "período atual";
  const { totals } = selected;
  const periodText = selected.periodLabel.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 min-[1680px]:grid-cols-6">
        <MetricCard
          label="Investimento"
          icon={Wallet}
          info={<TaxInfo />}
          value={formatCurrency(totals.amountSpentWithTax)}
          change={delta(selected.spentChange)}
          positive={selected.spentChange >= 0}
          sub={foreignSub(totals.amountSpentOriginalWithTax, totals.currency)}
        />
        <MetricCard
          label="Resultados"
          icon={Target}
          value={formatInt(totals.results)}
          change={delta(selected.resultsChange)}
          positive={selected.resultsChange >= 0}
        />
        <MetricCard
          label="Custo por resultado"
          icon={Coins}
          value={formatCurrency(totals.costPerLead)}
          change={delta(selected.cplChange)}
          positive={selected.cplChange <= 0}
          sub={foreignSub(totals.costPerLeadOriginal, totals.currency)}
        />
        <MetricCard
          label="CTR médio"
          icon={MousePointerClick}
          value={formatPercent(totals.ctr)}
          change={delta(selected.ctrChange)}
          positive={selected.ctrChange >= 0}
        />
        <MetricCard
          label="Cliques"
          icon={Activity}
          value={formatInt(totals.clicks)}
          change={delta(selected.clicksChange)}
          positive={selected.clicksChange >= 0}
        />
        <MetricCard
          label="Impressões"
          icon={Eye}
          value={formatInt(totals.impressions)}
          change={delta(selected.impressionsChange)}
          positive={selected.impressionsChange >= 0}
        />
      </div>

      <div className="flex flex-wrap gap-5">
        <Panel
          className="flex-[1.7_1_520px]"
          title="Funil das campanhas"
          subtitle={`Da impressão ao resultado · ${periodText}`}
          action={<PanelLink href={scopedHref("/dashboard/campanhas")}>Ver campanhas</PanelLink>}
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
              As métricas desta conta ainda não foram importadas para o período selecionado.
            </p>
          )}
        </Panel>

        <div className="flex min-w-0 flex-[1_1_320px]">
          <PulsePanel
            stamp={`Atualizado ${formatDateTime(syncStatus?.lastSuccessAt)}`}
            lines={[
              {
                before: "Você investiu ",
                strong: formatCurrency(totals.amountSpentWithTax),
                after: ` · ${periodText}.`,
              },
              {
                before: "Os anúncios geraram ",
                strong: `${formatInt(totals.results)} resultados`,
                after: ".",
              },
              {
                before: "Cada resultado custou em média ",
                strong: formatCurrency(totals.costPerLead),
                after: ".",
              },
              {
                strong: formatPercent(totals.ctr),
                after: " de quem viu um anúncio clicou nele.",
              },
              {
                strong: `${selected.campaigns.length} ${selected.campaigns.length === 1 ? "campanha" : "campanhas"}`,
                after: " com entrega no período.",
              },
            ]}
            footer={
              <PulseLink href={scopedHref("/dashboard/campanhas")}>
                <Megaphone className="size-[15px] text-brand-300" strokeWidth={1.75} />
                Abrir campanhas
              </PulseLink>
            }
          />
        </div>
      </div>

      {comparePrevious ? (
        <DashboardChart
          kind="comparison"
          current={selected.totals}
          previous={selected.previousTotals}
          periodLabel={selected.periodLabel}
        />
      ) : null}

      <div className="flex flex-wrap gap-5">
        <div className="flex min-w-0 flex-[1.7_1_520px]">
          <DashboardChart
            kind="performance"
            data={selected.chartData}
            periodLabel={selected.periodLabel}
            emptyMessage="As métricas desta conta ainda não foram importadas para o período selecionado."
          />
        </div>

        <Panel
          className="flex-[1_1_320px] gap-3.5"
          title="Resumo do período"
          subtitle={selected.periodLabel}
          icon={
            <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-[linear-gradient(135deg,var(--brand-50),var(--brand-100))] text-brand-600">
              <TrendingUp className="size-4" strokeWidth={1.75} />
            </span>
          }
        >
          <div className="flex flex-col gap-2">
            <SummaryRow icon={Radio} label="Alcance" value={formatInt(totals.reach)} />
            <SummaryRow
              icon={Repeat}
              label="Frequência média"
              value={totals.frequency.toFixed(2).replace(".", ",")}
            />
            <SummaryRow
              icon={Eye}
              label="CPM"
              value={formatMoney(totals.cpm, "BRL")}
            />
            <SummaryRow
              icon={TrendingUp}
              label="ROAS do período"
              value={`${totals.roas.toFixed(2).replace(".", ",")}x`}
            />
            <SummaryRow
              icon={RefreshCw}
              label="Atualização dos dados"
              value="manual"
              hint={
                syncStatus?.message ??
                "Use Atualizar métricas na página de campanhas para buscar os dados mais recentes da Meta Ads."
              }
            />
          </div>
        </Panel>
      </div>

      <section className="overflow-hidden rounded-[18px] border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h3 className="text-base font-semibold tracking-[-0.01em]">
              Campanhas do período
            </h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Ordenadas pelo investimento · {campaigns.length} liberadas para você
            </p>
          </div>
          <PanelLink href={scopedHref("/dashboard/campanhas")}>Ver todas</PanelLink>
        </div>
        <CampaignRankTable rows={selected.rankRows} />
      </section>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line-soft p-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="size-[15px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
          <span className="text-text-2">{label}</span>
          <b className="font-semibold tabular-nums text-foreground">{value}</b>
        </div>
        {hint ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
