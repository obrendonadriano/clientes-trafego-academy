"use client";

import { useActionState, useMemo, useState } from "react";
import { createCampaignAction } from "@/app/admin/actions";
import {
  importMetaCampaignsAction,
  importMetaInsightsAction,
} from "@/app/admin/campanhas/actions";
import { AdminFormCard } from "@/components/admin/admin-form-card";
import { CampaignsTable } from "@/components/dashboard/campaigns-table";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  PeriodFilter,
  type PeriodFilterValue,
} from "@/components/dashboard/period-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  filterMetricsByRange,
  getDateRangeForPeriod,
  summarizeMetrics,
} from "@/lib/dashboard-metrics";
import type { CampaignWithMetrics, Client, RawCampaignMetric } from "@/lib/types";

type AdminCampaignsPageProps = {
  campaigns: CampaignWithMetrics[];
  clients: Client[];
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

export function AdminCampaignsPage({
  campaigns,
  clients,
  metricRows,
}: AdminCampaignsPageProps) {
  const [state, importAction] = useActionState(importMetaCampaignsAction, {});
  const [insightsState, importInsightsAction] = useActionState(
    importMetaInsightsAction,
    {},
  );
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [comparePrevious, setComparePrevious] = useState(true);
  const [customRange, setCustomRange] = useState({
    start: "2026-04-01",
    end: "2026-04-08",
  });

  const selected = useMemo(() => {
    const range = getDateRangeForPeriod(period, customRange);
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

        return {
          ...campaign,
          metrics: {
            ...campaign.metrics,
            amountSpent: formatCurrency(summary.amountSpent),
            clicks: String(Math.round(summary.clicks)),
            ctr: formatPercent(summary.ctr),
            leads: String(Math.round(summary.leads)),
            costPerLead: formatCurrency(summary.costPerLead),
            roas: formatMultiplier(summary.roas),
            periodLabel: period,
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
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Campanhas
        </p>
        <h3 className="mt-2 font-display text-3xl font-semibold">
          Gestão de campanhas
        </h3>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Cadastre campanhas aqui e depois libere para cada cliente dentro da área de clientes.
        </p>
      </div>

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
        <MetricCard
          label="Campanhas com dados"
          value={String(selected.campaigns.filter((item) => item.metricCount > 0).length)}
          change="período filtrado"
        />
        <MetricCard
          label="Investimento total"
          value={formatCurrency(selected.totals.amountSpent)}
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

      <div className="rounded-[1.75rem] border border-border/60 bg-background/60 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Importação externa</p>
            <h4 className="mt-1 font-display text-2xl font-semibold">
              Meta Ads
            </h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Importe campanhas conectadas pela Meta e traga para o sistema.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <form action={importAction}>
              <Button size="lg">Importar campanhas</Button>
            </form>
            <form action={importInsightsAction}>
              <Button size="lg" variant="outline">
                Importar métricas
              </Button>
            </form>
          </div>
        </div>

        {state.error ? (
          <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        {state.success ? (
          <p className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            {state.success}
          </p>
        ) : null}

        {insightsState.error ? (
          <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {insightsState.error}
          </p>
        ) : null}

        {insightsState.success ? (
          <p className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            {insightsState.success}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <AdminFormCard
          title="Nova campanha"
          description="Vincule uma campanha a um cliente já cadastrado."
          action={createCampaignAction}
          submitLabel="Salvar campanha"
        >
          <div className="space-y-2">
            <Label htmlFor="campaignName">Nome da campanha</Label>
            <Input id="campaignName" name="name" required />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue="Ativa">
                <option value="Ativa">Ativa</option>
                <option value="Pausada">Pausada</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform">Plataforma</Label>
              <Select id="platform" name="platform" defaultValue="Meta Ads">
                <option value="Meta Ads">Meta Ads</option>
                <option value="Google Ads">Google Ads</option>
                <option value="TikTok Ads">TikTok Ads</option>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaignClientId">Cliente</Label>
            <Select id="campaignClientId" name="clientId" defaultValue="">
              <option value="" disabled>
                Selecione um cliente
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </div>
        </AdminFormCard>

        <CampaignsTable campaigns={selected.campaigns} />
      </div>
    </div>
  );
}
