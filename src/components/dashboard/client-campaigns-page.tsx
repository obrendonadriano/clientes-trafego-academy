"use client";

import { useActionState, useMemo, useState } from "react";
import { refreshClientMetricsAction } from "@/app/dashboard/actions";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import {
  PeriodFilter,
  type PeriodFilterValue,
} from "@/components/dashboard/period-filter";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import {
  filterMetricsByRange,
  formatMoney,
  formatPeriodLabel,
  getDateRangeForPeriod,
  getDefaultCustomRange,
  resolveCurrency,
  sumResults,
  getReferenceNowForPeriod,
} from "@/lib/dashboard-metrics";
import type {
  CampaignWithMetrics,
  RawCampaignMetric,
  SyncStatus,
} from "@/lib/types";

type ClientCampaignsPageProps = {
  campaigns: CampaignWithMetrics[];
  metricRows: RawCampaignMetric[];
  syncStatus: SyncStatus | null;
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Aguardando primeira atualização";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

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

export function ClientCampaignsPage({
  campaigns,
  metricRows,
  syncStatus,
}: ClientCampaignsPageProps) {
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [customRange, setCustomRange] = useState(() => getDefaultCustomRange());
  const [refreshState, refreshAction] = useActionState(
    refreshClientMetricsAction,
    {},
  );

  const filteredCampaigns = useMemo(() => {
    const referenceDate = getReferenceNowForPeriod(metricRows, period, customRange);
    const range = getDateRangeForPeriod(period, customRange, referenceDate);
    const currentRows = filterMetricsByRange(metricRows, range);
    const metricsByCampaign = new Map<string, RawCampaignMetric[]>();

    for (const row of currentRows) {
      const items = metricsByCampaign.get(row.campaignId) ?? [];
      items.push(row);
      metricsByCampaign.set(row.campaignId, items);
    }

    const periodLabel = formatPeriodLabel(period, customRange, referenceDate);

    return campaigns
      .map((campaign) => {
        const rows = metricsByCampaign.get(campaign.id) ?? [];

        if (rows.length === 0) {
          return {
            ...campaign,
            metricCount: 0,
          };
        }

        const totals = rows.reduce(
          (acc, row) => {
            acc.amountSpent += row.amountSpent;
            acc.amountSpentOriginal +=
              row.exchangeRate && row.exchangeRate > 0
                ? row.amountSpent / row.exchangeRate
                : row.amountSpent;
            acc.clicks += row.clicks;
            acc.impressions += row.impressions;
            acc.revenue += row.roas * row.amountSpent;
            return acc;
          },
          {
            amountSpent: 0,
            amountSpentOriginal: 0,
            clicks: 0,
            impressions: 0,
            revenue: 0,
          },
        );
        const resultCount = sumResults(rows);
        const resultLabel = campaign.metrics.resultLabel;
        const currency = resolveCurrency(rows);
        const isForeign = currency !== "BRL";

        return {
          ...campaign,
          metrics: {
            ...campaign.metrics,
            amountSpent: formatCurrency(totals.amountSpent),
            amountSpentOriginal: isForeign
              ? formatMoney(totals.amountSpentOriginal, currency)
              : undefined,
            clicks: String(Math.round(totals.clicks)),
            ctr: formatPercent(
              totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
            ),
            results: String(Math.round(resultCount)),
            resultLabel,
            leads: String(Math.round(resultCount)),
            costPerLead: formatCurrency(
              resultCount > 0 ? totals.amountSpent / resultCount : 0,
            ),
            costPerLeadOriginal:
              isForeign && resultCount > 0
                ? formatMoney(totals.amountSpentOriginal / resultCount, currency)
                : undefined,
            roas: `${(totals.amountSpent > 0 ? totals.revenue / totals.amountSpent : 0).toFixed(2).replace(".", ",")}x`,
            periodLabel,
            currency,
          },
          metricCount: rows.length,
        };
      })
      .filter((campaign) => campaign.metricCount > 0);
  }, [campaigns, customRange, metricRows, period]);

  return (
    <div className="space-y-6">
      <div className="dashboard-card rounded-[1.5rem] border p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Meta Ads</p>
            <h4 className="mt-1 font-display text-2xl font-semibold text-foreground">
              Atualizar métricas
            </h4>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Puxa os dados mais recentes das suas campanhas direto da Meta Ads.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Última atualização:{" "}
              <strong className="text-foreground">
                {formatDateTime(syncStatus?.lastSuccessAt)}
              </strong>
            </p>
          </div>
          <form action={refreshAction}>
            <FormPendingButton
              size="lg"
              idleLabel="Atualizar métricas"
              pendingLabel="Atualizando métricas..."
            >
              Atualizar métricas
            </FormPendingButton>
          </form>
        </div>

        {refreshState.error ? (
          <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {refreshState.error}
          </p>
        ) : null}

        {refreshState.success ? (
          <p className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            {refreshState.success}
          </p>
        ) : null}
      </div>

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

      <CampaignsTable campaigns={filteredCampaigns} />
    </div>
  );
}
