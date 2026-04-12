"use client";

import { useMemo, useState } from "react";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  PeriodFilter,
  type PeriodFilterValue,
} from "@/components/dashboard/period-filter";
import {
  filterMetricsByRange,
  formatPeriodLabel,
  getDateRangeForPeriod,
  getLatestMetricReferenceDate,
} from "@/lib/dashboard-metrics";
import type {
  CampaignWithMetrics,
  RawCampaignMetric,
  User,
} from "@/lib/types";

type ClientCampaignsPageProps = {
  user: User;
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
  user,
  campaigns,
  metricRows,
}: ClientCampaignsPageProps) {
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [customRange, setCustomRange] = useState({
    start: "2026-04-01",
    end: "2026-04-08",
  });

  const filteredCampaigns = useMemo(() => {
    const referenceDate = getLatestMetricReferenceDate(metricRows);
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
            acc.clicks += row.clicks;
            acc.impressions += row.impressions;
            acc.results += row.results;
            acc.leads += row.leads;
            acc.costPerLead += row.costPerLead;
            acc.roas += row.roas;
            acc.resultLabel = row.resultLabel || acc.resultLabel;
            return acc;
          },
          {
            amountSpent: 0,
            clicks: 0,
            impressions: 0,
            results: 0,
            leads: 0,
            costPerLead: 0,
            roas: 0,
            resultLabel: "Leads no site",
          },
        );

        return {
          ...campaign,
          metrics: {
            ...campaign.metrics,
            amountSpent: formatCurrency(totals.amountSpent),
            clicks: String(Math.round(totals.clicks)),
            ctr: formatPercent(
              totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
            ),
            results: String(Math.round(totals.results)),
            resultLabel: totals.resultLabel,
            leads: String(Math.round(totals.leads)),
            costPerLead: formatCurrency(
              totals.leads > 0 ? totals.amountSpent / totals.leads : 0,
            ),
            roas: `${(totals.roas / rows.length).toFixed(2).replace(".", ",")}x`,
            periodLabel,
          },
          metricCount: rows.length,
        };
      })
      .filter((campaign) => campaign.metricCount > 0 || currentRows.length === 0);
  }, [campaigns, customRange, metricRows, period]);

  return (
    <DashboardShell
      user={user}
      title={`Campanhas de ${user.clientName}`}
      subtitle="Tabela dedicada para acompanhar somente as campanhas liberadas para esta conta."
    >
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
    </DashboardShell>
  );
}
