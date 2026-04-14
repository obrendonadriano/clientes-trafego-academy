"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClientWorkspaceAction } from "@/app/admin/actions";
import { AdminFormCard } from "@/components/admin/admin-form-card";
import { CampaignMultiSelect } from "@/components/admin/campaign-multi-select";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  PeriodFilter,
  type PeriodFilterValue,
} from "@/components/dashboard/period-filter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  filterMetricsByRange,
  getDateRangeForPeriod,
  getReferenceNowForPeriod,
  summarizeMetrics,
} from "@/lib/dashboard-metrics";
import type {
  CampaignPermission,
  CampaignWithMetrics,
  Client,
  RawCampaignMetric,
  User,
} from "@/lib/types";

type AdminClientsPageProps = {
  clients: Client[];
  campaigns: CampaignWithMetrics[];
  permissions: CampaignPermission[];
  clientUsers: User[];
  metricRows: RawCampaignMetric[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMultiplier(value: number) {
  return `${value.toFixed(2).replace(".", ",")}x`;
}

export function AdminClientsPage({
  clients,
  campaigns,
  permissions,
  clientUsers,
  metricRows,
}: AdminClientsPageProps) {
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [comparePrevious, setComparePrevious] = useState(true);
  const [customRange, setCustomRange] = useState({
    start: "2026-04-01",
    end: "2026-04-08",
  });

  const selected = useMemo(() => {
    const referenceDate = getReferenceNowForPeriod(metricRows, period, customRange);
    const range = getDateRangeForPeriod(period, customRange, referenceDate);
    const rowsInRange = filterMetricsByRange(metricRows, range);
    const metricsByCampaign = new Map<string, RawCampaignMetric[]>();

    for (const row of rowsInRange) {
      const items = metricsByCampaign.get(row.campaignId) ?? [];
      items.push(row);
      metricsByCampaign.set(row.campaignId, items);
    }

    const clientCards = clients.map((client) => {
      const linkedUser = clientUsers.find(
        (clientUser) => clientUser.clientId === client.id,
      );
      const allowedCampaignIds = linkedUser
        ? permissions
            .filter((permission) => permission.userId === linkedUser.id)
            .map((permission) => permission.campaignId)
        : [];
      const allowedCampaigns = campaigns.filter((campaign) =>
        allowedCampaignIds.includes(campaign.id),
      );
      const rows = allowedCampaignIds.flatMap(
        (campaignId) => metricsByCampaign.get(campaignId) ?? [],
      );
      const totals = summarizeMetrics(rows);

      return {
        client,
        linkedUser,
        allowedCampaigns,
        totals,
      };
    });

    const totals = summarizeMetrics(rowsInRange);

    return {
      clientCards: clientCards.sort(
        (a, b) => b.totals.amountSpent - a.totals.amountSpent,
      ),
      totals,
      clientsWithData: clientCards.filter((item) => item.totals.amountSpent > 0).length,
    };
  }, [campaigns, clientUsers, clients, customRange, metricRows, permissions, period]);

  return (
    <div className="min-w-0 space-y-6 overflow-hidden">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Clientes
        </p>
        <h3 className="mt-2 font-display text-3xl font-semibold">
          Cadastro unificado do cliente
        </h3>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Empresa, acesso ao portal e campanhas permitidas ficam todos no mesmo fluxo.
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
          label="Clientes com dados"
          value={String(selected.clientsWithData)}
          change="período filtrado"
        />
        <MetricCard
          label="Investimento dos clientes"
          value={formatCurrency(selected.totals.amountSpent)}
          change="somente campanhas liberadas"
        />
        <MetricCard
          label="Leads gerados"
          value={String(Math.round(selected.totals.leads))}
          change="carteira atual"
        />
        <MetricCard
          label="ROAS médio"
          value={formatMultiplier(selected.totals.roas)}
          change="visão da base"
        />
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminFormCard
          title="Novo cliente"
          description="Preencha uma vez só para deixar o cliente pronto no sistema."
          action={createClientWorkspaceAction}
          submitLabel="Criar cliente"
        >
          <div className="min-w-0 space-y-4 overflow-hidden">
            <div>
              <p className="text-sm font-medium text-foreground">Empresa</p>
              <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da empresa</Label>
                  <Input id="companyName" name="companyName" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactName">Responsável</Label>
                  <Input id="contactName" name="contactName" required />
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input id="whatsapp" name="whatsapp" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email de acesso</Label>
                <Input id="email" name="email" type="email" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" />
            </div>

            <div>
              <p className="font-display text-2xl font-semibold text-foreground">
                Acesso ao portal
              </p>
              <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="accountName">Nome exibido</Label>
                  <Input id="accountName" name="accountName" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Usuário</Label>
                  <Input id="username" name="username" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha inicial</Label>
                  <Input id="password" name="password" type="password" required />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Campanhas liberadas para esse cliente
              </p>
              {campaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                  Ainda não há campanhas cadastradas. Vá em Campanhas primeiro.
                </div>
              ) : (
                <CampaignMultiSelect campaigns={campaigns} />
              )}
            </div>
          </div>
        </AdminFormCard>

        <Card className="min-w-0 overflow-hidden border-border/60 bg-background/60">
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              Clientes cadastrados
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3 overflow-hidden">
            {selected.clientCards.map(({ client, linkedUser, allowedCampaigns, totals }) => (
              <div
                key={client.id}
                className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card px-4 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{client.companyName}</p>
                    <p className="text-sm text-muted-foreground">{client.contactName}</p>
                    <p className="mt-2 min-w-0 text-sm text-muted-foreground">
                      Login:{" "}
                      <strong className="break-all text-foreground">
                        {linkedUser?.email || "Ainda sem acesso criado"}
                      </strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={client.active ? "success" : "secondary"}>
                      {client.active ? "Ativo" : "Inativo"}
                    </Badge>
                    <Link
                      href={`/admin/clientes/${client.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition hover:bg-accent"
                    >
                      Editar
                    </Link>
                  </div>
                </div>
                <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Investimento:{" "}
                    <strong className="text-foreground">
                      {formatCurrency(totals.amountSpent)}
                    </strong>
                  </div>
                  <div className="rounded-2xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Leads:{" "}
                    <strong className="text-foreground">{Math.round(totals.leads)}</strong>
                  </div>
                  <div className="rounded-2xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    ROAS:{" "}
                    <strong className="text-foreground">
                      {formatMultiplier(totals.roas)}
                    </strong>
                  </div>
                  <div className="rounded-2xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    CPL:{" "}
                    <strong className="text-foreground">
                      {formatCurrency(totals.costPerLead)}
                    </strong>
                  </div>
                </div>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="max-w-full break-words rounded-full bg-muted px-3 py-1">
                    {allowedCampaigns.length} campanhas liberadas
                  </span>
                  <span className="max-w-full break-all rounded-full bg-muted px-3 py-1">
                    {client.whatsapp}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
