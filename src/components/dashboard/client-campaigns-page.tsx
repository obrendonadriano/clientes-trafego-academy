"use client";

import { useMemo, useState } from "react";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import {
  PeriodFilter,
  type PeriodFilterValue,
} from "@/components/dashboard/period-filter";
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
} from "@/lib/types";

type ClientCampaignsPageProps = {
  campaigns: CampaignWithMetrics[];
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

export function ClientCampaignsPage({
  campaigns,
  metricRows,
}: ClientCampaignsPageProps) {
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [customRange, setCustomRange] = useState(() => getDefaultCustomRange());

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
