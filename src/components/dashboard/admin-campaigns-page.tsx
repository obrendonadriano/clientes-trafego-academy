"use client";

import dynamic from "next/dynamic";
import { useActionState, useMemo, useState } from "react";
import { syncMetaAction } from "@/app/admin/campanhas/actions";
import {
  CampaignLevelTabs,
  type CampaignLevel,
} from "@/components/dashboard/campaign-level-tabs";
import { AdLevelTable } from "@/components/dashboard/ad-level-table";
import { usePeriodScope } from "@/components/shell/period-scope";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import { MetaSyncOverlay } from "@/components/dashboard/meta-sync-overlay";
import { MetricCard } from "@/components/dashboard/metric-card";
import { TaxInfo } from "@/components/dashboard/tax-info";

const CampaignBreakdownChart = dynamic(
  () =>
    import("@/components/dashboard/campaign-breakdown-chart").then(
      (module) => module.CampaignBreakdownChart,
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
import { FormPendingButton } from "@/components/ui/form-pending-button";
import {
  filterMetricsByRange,
  formatMoney,
  getDateRangeForPeriod,
  getReferenceNowForPeriod,
  sumResults,
  summarizeMetrics,
} from "@/lib/dashboard-metrics";
import type { CampaignWithMetrics, RawCampaignMetric } from "@/lib/types";
import type { AdLevelRow } from "@/lib/data/ad-levels";

type AdminCampaignsPageProps = {
  campaigns: CampaignWithMetrics[];
  metricRows: RawCampaignMetric[];
  adSets: AdLevelRow[];
  adSetsNotice?: string;
  ads: AdLevelRow[];
  adsNotice?: string;
  initialLevel?: CampaignLevel;
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

export function AdminCampaignsPage({
  campaigns,
  metricRows,
  adSets,
  adSetsNotice,
  ads,
  adsNotice,
  initialLevel = "campaign",
}: AdminCampaignsPageProps) {
  const [activeLevel, setActiveLevel] = useState<CampaignLevel>(initialLevel);
  const [syncState, syncMeta, isSyncing] = useActionState(syncMetaAction, {});
  const scope = usePeriodScope();
  const { period, customRange } = scope;

  const selected = useMemo(() => {
    const referenceDate = getReferenceNowForPeriod(metricRows, period, customRange);
    const range = getDateRangeForPeriod(period, customRange, referenceDate);
    const periodRows = filterMetricsByRange(metricRows, range);
    const totals = summarizeMetrics(periodRows);
    const metricMap = new Map<string, RawCampaignMetric[]>();

    for (const row of periodRows) {
      const items = metricMap.get(row.campaignId) ?? [];
      items.push(row);
      metricMap.set(row.campaignId, items);
    }

    const filteredCampaigns = campaigns
      .map((campaign) => {
        const rows = metricMap.get(campaign.id) ?? [];
        const summary = summarizeMetrics(rows);
        const resultCount = sumResults(rows);
        const resultLabel = campaign.metrics.resultLabel;
        const isForeign = summary.currency !== "BRL";

        return {
          ...campaign,
          metrics: {
            ...campaign.metrics,
            // Investido exibido COM impostos; o custo por resultado abaixo
            // segue sobre o valor puro, para bater com a Meta.
            amountSpent: formatCurrency(summary.amountSpentWithTax),
            amountSpentOriginal: isForeign
              ? formatMoney(summary.amountSpentOriginalWithTax, summary.currency)
              : undefined,
            clicks: String(Math.round(summary.clicks)),
            ctr: formatPercent(summary.ctr),
            results: String(Math.round(resultCount)),
            resultLabel,
            leads: String(Math.round(resultCount)),
            costPerLead: formatCurrency(
              resultCount > 0 ? summary.amountSpent / resultCount : 0,
            ),
            costPerLeadOriginal:
              isForeign && resultCount > 0
                ? formatMoney(summary.amountSpentOriginal / resultCount, summary.currency)
                : undefined,
            roas: formatMultiplier(summary.roas),
            periodLabel: period,
            currency: summary.currency,
          },
          metricCount: rows.length,
          amountSpentRaw: summary.amountSpent,
          leadsRaw: summary.leads,
        };
      })
      .filter((campaign) => campaign.metricCount > 0 || periodRows.length === 0)
      .sort((a, b) => b.amountSpentRaw - a.amountSpentRaw);

    return {
      totals,
      campaigns: filteredCampaigns,
      activeCampaignsWithData: filteredCampaigns.filter(
        (campaign) => campaign.status === "Ativa" && campaign.metricCount > 0,
      ).length,
    };
  }, [campaigns, customRange, metricRows, period]);

  return (
    <div className="space-y-6">
      <MetaSyncOverlay open={isSyncing} />

      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Campanhas
        </p>
        <h3 className="mt-2 font-display text-3xl font-semibold text-foreground">
          Gestão de campanhas
        </h3>
        <p className="mt-2 max-w-3xl leading-7 text-muted-foreground">
          Cadastre campanhas aqui e depois libere para cada cliente dentro da área de clientes.
        </p>
      </div>


      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Campanhas com dados"
          value={String(selected.campaigns.filter((item) => item.metricCount > 0).length)}
          change="período filtrado"
        />
        <MetricCard
          label="Investimento total"
          value={formatCurrency(selected.totals.amountSpentWithTax)}
          info={<TaxInfo />}
          change="Meta Ads importado"
        />
        <MetricCard
          label="Leads do período"
          value={String(Math.round(selected.totals.leads))}
          change="somando campanhas filtradas"
        />
        <MetricCard
          label="ROAS médio"
          value={formatMultiplier(selected.totals.roas)}
          change={`${selected.activeCampaignsWithData} ativas com dados`}
        />
      </div>

      <div className="dashboard-card rounded-[1.5rem] border p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Importação externa</p>
            <h4 className="mt-1 font-display text-2xl font-semibold text-foreground">
              Meta Ads
            </h4>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Um botão só atualiza campanhas, conjuntos, anúncios e métricas de
              todas as contas conectadas. As abas usam o último snapshot salvo
              no Supabase e não aguardam a Meta para abrir.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <form action={syncMeta}>
              <FormPendingButton
                size="lg"
                idleLabel="Atualizar dados da Meta"
                pendingLabel="Atualizando... pode levar alguns minutos"
              >
                Atualizar dados da Meta
              </FormPendingButton>
            </form>
          </div>
        </div>

        {syncState.error ? (
          <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {syncState.error}
          </p>
        ) : null}

        {syncState.success ? (
          <p className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            {syncState.success}
          </p>
        ) : null}
      </div>

      <CampaignBreakdownChart
        data={selected.campaigns.map((campaign) => ({
          name: campaign.name,
          amountSpent: campaign.amountSpentRaw,
          leads: campaign.leadsRaw,
        }))}
        periodLabel={period}
      />

      <div className="space-y-3">
        <CampaignLevelTabs
          activeLevel={activeLevel}
          onLevelChange={setActiveLevel}
        />
        {activeLevel === "campaign" ? (
          <CampaignsTable campaigns={selected.campaigns} editable />
        ) : activeLevel === "adset" ? (
          <AdLevelTable
            level="adset"
            rows={adSets}
            notice={adSetsNotice}
            editable
          />
        ) : (
          <AdLevelTable level="ad" rows={ads} notice={adsNotice} editable />
        )}
      </div>
    </div>
  );
}
