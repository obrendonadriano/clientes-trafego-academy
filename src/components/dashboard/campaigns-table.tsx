"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CampaignWithMetrics } from "@/lib/types";

type CampaignsTableProps = {
  campaigns: CampaignWithMetrics[];
};

type SortKey =
  | "name"
  | "status"
  | "amountSpent"
  | "clicks"
  | "ctr"
  | "results"
  | "costPerLead"
  | "roas";

type SortDirection = "asc" | "desc";

const columns: Array<{
  key: SortKey;
  label: string;
  className?: string;
}> = [
  { key: "name", label: "Campanha", className: "min-w-[260px]" },
  { key: "status", label: "Status", className: "min-w-[120px]" },
  { key: "amountSpent", label: "Investido", className: "min-w-[116px]" },
  { key: "clicks", label: "Cliques", className: "min-w-[90px]" },
  { key: "ctr", label: "CTR", className: "min-w-[88px]" },
  { key: "results", label: "Resultados", className: "min-w-[128px]" },
  { key: "costPerLead", label: "CPL", className: "min-w-[108px]" },
  { key: "roas", label: "ROAS", className: "min-w-[88px]" },
];

function parseCurrency(value: string) {
  return Number(
    value
      .replace(/[^\d,-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
}

function parsePercent(value: string) {
  return Number(value.replace("%", "").replace(",", "."));
}

function parseMultiplier(value: string) {
  return Number(value.replace("x", "").replace(",", "."));
}

function parseNumber(value: string) {
  return Number(value.replace(/\./g, "").replace(",", "."));
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

function formatMultiplier(value: number) {
  return `${value.toFixed(2).replace(".", ",")}x`;
}

function getSortableValue(campaign: CampaignWithMetrics, key: SortKey) {
  switch (key) {
    case "name":
      return campaign.name.toLowerCase();
    case "status":
      return campaign.status.toLowerCase();
    case "amountSpent":
      return parseCurrency(campaign.metrics.amountSpent);
    case "clicks":
      return parseNumber(campaign.metrics.clicks);
    case "ctr":
      return parsePercent(campaign.metrics.ctr);
    case "results":
      return parseNumber(campaign.metrics.results);
    case "costPerLead":
      return parseCurrency(campaign.metrics.costPerLead);
    case "roas":
      return parseMultiplier(campaign.metrics.roas);
    default:
      return campaign.name.toLowerCase();
  }
}

function getNextDirection(currentKey: SortKey, activeKey: SortKey, direction: SortDirection) {
  if (currentKey !== activeKey) {
    return "asc";
  }

  return direction === "asc" ? "desc" : "asc";
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) {
    return <ArrowUpDown className="size-3.5" />;
  }

  return direction === "asc" ? (
    <ArrowUp className="size-3.5" />
  ) : (
    <ArrowDown className="size-3.5" />
  );
}

export function CampaignsTable({ campaigns }: CampaignsTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("amountSpent");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");

  const sortedCampaigns = React.useMemo(() => {
    const items = [...campaigns];

    items.sort((a, b) => {
      const first = getSortableValue(a, sortKey);
      const second = getSortableValue(b, sortKey);

      if (typeof first === "string" && typeof second === "string") {
        const comparison = first.localeCompare(second, "pt-BR");
        return sortDirection === "asc" ? comparison : -comparison;
      }

      const comparison = Number(first) - Number(second);
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return items;
  }, [campaigns, sortDirection, sortKey]);

  const totals = React.useMemo(() => {
    return sortedCampaigns.reduce(
      (acc, campaign) => {
        acc.amountSpent += parseCurrency(campaign.metrics.amountSpent);
        acc.clicks += parseNumber(campaign.metrics.clicks);
        acc.ctr.push(parsePercent(campaign.metrics.ctr));
        acc.results += parseNumber(campaign.metrics.results);
        acc.costPerLead.push(parseCurrency(campaign.metrics.costPerLead));
        acc.roas.push(parseMultiplier(campaign.metrics.roas));
        return acc;
      },
      {
        amountSpent: 0,
        clicks: 0,
        ctr: [] as number[],
        results: 0,
        costPerLead: [] as number[],
        roas: [] as number[],
      },
    );
  }, [sortedCampaigns]);

  const averageCtr =
    totals.ctr.length > 0
      ? totals.ctr.reduce((sum, value) => sum + value, 0) / totals.ctr.length
      : 0;
  const averageCostPerLead =
    totals.costPerLead.length > 0
      ? totals.costPerLead.reduce((sum, value) => sum + value, 0) / totals.costPerLead.length
      : 0;
  const averageRoas =
    totals.roas.length > 0
      ? totals.roas.reduce((sum, value) => sum + value, 0) / totals.roas.length
      : 0;

  function handleSort(columnKey: SortKey) {
    const nextDirection = getNextDirection(columnKey, sortKey, sortDirection);
    setSortKey(columnKey);
    setSortDirection(nextDirection);
  }

  if (campaigns.length === 0) {
    return (
      <div className="dashboard-card overflow-hidden rounded-[1.5rem] border">
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma campanha com métricas para o período selecionado.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mobile: cards no lugar da tabela larga (que estouraria a tela). */}
      <div className="space-y-3 md:hidden">
        <div className="dashboard-card flex items-center gap-3 rounded-[1.5rem] border px-4 py-3">
          <span className="shrink-0 text-sm text-muted-foreground">Ordenar por</span>
          <Select
            value={`${sortKey}:${sortDirection}`}
            onChange={(event) => {
              const [key, direction] = event.target.value.split(":");
              setSortKey(key as SortKey);
              setSortDirection(direction as SortDirection);
            }}
            className="h-10"
          >
            <option value="amountSpent:desc">Maior investimento</option>
            <option value="amountSpent:asc">Menor investimento</option>
            <option value="results:desc">Mais resultados</option>
            <option value="ctr:desc">Maior CTR</option>
            <option value="costPerLead:asc">Menor CPL</option>
            <option value="roas:desc">Maior ROAS</option>
            <option value="name:asc">Nome (A-Z)</option>
          </Select>
        </div>

        {sortedCampaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="dashboard-card rounded-[1.5rem] border p-4 text-foreground"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium leading-snug">{campaign.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {campaign.platform}
                </p>
              </div>
              <Badge variant={campaign.status === "Ativa" ? "success" : "secondary"}>
                {campaign.status}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-2xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                <p className="text-xs text-muted-foreground">Investido</p>
                <p className="mt-0.5 font-semibold">{campaign.metrics.amountSpent}</p>
                {campaign.metrics.amountSpentOriginal ? (
                  <p className="text-xs text-muted-foreground">
                    {campaign.metrics.amountSpentOriginal}
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                <p className="text-xs text-muted-foreground">
                  {campaign.metrics.resultLabel}
                </p>
                <p className="mt-0.5 font-semibold">{campaign.metrics.results}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                <p className="text-xs text-muted-foreground">Cliques</p>
                <p className="mt-0.5 font-semibold">{campaign.metrics.clicks}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                <p className="text-xs text-muted-foreground">CTR</p>
                <p className="mt-0.5 font-semibold">{campaign.metrics.ctr}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                <p className="text-xs text-muted-foreground">CPL</p>
                <p className="mt-0.5 font-semibold">{campaign.metrics.costPerLead}</p>
                {campaign.metrics.costPerLeadOriginal ? (
                  <p className="text-xs text-muted-foreground">
                    {campaign.metrics.costPerLeadOriginal}
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                <p className="text-xs text-muted-foreground">ROAS</p>
                <p className="mt-0.5 font-semibold">{campaign.metrics.roas}</p>
              </div>
            </div>
          </div>
        ))}

        <div className="dashboard-card rounded-[1.5rem] border p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">
            Totais • {sortedCampaigns.length} campanha
            {sortedCampaigns.length === 1 ? "" : "s"}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            <span>
              Investido:{" "}
              <strong className="text-foreground">
                {formatCurrency(totals.amountSpent)}
              </strong>
            </span>
            <span>
              Cliques:{" "}
              <strong className="text-foreground">
                {totals.clicks.toLocaleString("pt-BR")}
              </strong>
            </span>
            <span>
              CTR médio:{" "}
              <strong className="text-foreground">{formatPercent(averageCtr)}</strong>
            </span>
            <span>
              ROAS médio:{" "}
              <strong className="text-foreground">
                {formatMultiplier(averageRoas)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      <div className="dashboard-card hidden overflow-hidden rounded-[1.5rem] border text-foreground md:block">
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur dark:bg-[#111525]/95">
            <tr>
              {columns.map((column) => {
                const active = sortKey === column.key;

                return (
                  <th
                    key={column.key}
                    className={cn(
                      "border-b border-border/70 dark:border-white/10 px-4 py-3 font-medium",
                      column.className,
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className={cn(
                        "inline-flex items-center gap-2 text-left transition hover:text-foreground",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <span>{column.label}</span>
                      <SortIcon active={active} direction={sortDirection} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedCampaigns.map((campaign) => (
              <tr key={campaign.id} className="border-b border-border/60 dark:border-white/10 last:border-b-0">
                <td className="min-w-[260px] border-b border-border/60 dark:border-white/10 px-4 py-3 align-middle">
                  <div>
                    <p className="font-medium leading-snug text-foreground">{campaign.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{campaign.platform}</p>
                  </div>
                </td>
                <td className="min-w-[120px] border-b border-border/60 dark:border-white/10 px-4 py-3 align-middle">
                  <Badge variant={campaign.status === "Ativa" ? "success" : "secondary"}>
                    {campaign.status}
                  </Badge>
                </td>
                <td className="min-w-[116px] border-b border-border/60 dark:border-white/10 px-4 py-3 align-middle">
                  {campaign.metrics.amountSpent}
                  {campaign.metrics.amountSpentOriginal ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {campaign.metrics.amountSpentOriginal}
                    </span>
                  ) : null}
                </td>
                <td className="min-w-[90px] border-b border-border/60 dark:border-white/10 px-4 py-3 align-middle">
                  {campaign.metrics.clicks}
                </td>
                <td className="min-w-[88px] border-b border-border/60 dark:border-white/10 px-4 py-3 align-middle">
                  {campaign.metrics.ctr}
                </td>
                <td className="min-w-[128px] border-b border-border/60 dark:border-white/10 px-4 py-3 align-middle">
                  <div>
                    <p className="font-medium leading-none text-foreground">{campaign.metrics.results}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {campaign.metrics.resultLabel}
                    </p>
                  </div>
                </td>
                <td className="min-w-[108px] border-b border-border/60 dark:border-white/10 px-4 py-3 align-middle">
                  {campaign.metrics.costPerLead}
                  {campaign.metrics.costPerLeadOriginal ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {campaign.metrics.costPerLeadOriginal}
                    </span>
                  ) : null}
                </td>
                <td className="min-w-[88px] border-b border-border/60 dark:border-white/10 px-4 py-3 align-middle">
                  {campaign.metrics.roas}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-10 bg-card/95 backdrop-blur dark:bg-[#111525]/95">
            <tr className="text-foreground">
              <td className="border-t border-border/70 dark:border-white/10 px-4 py-3 font-semibold">Totais</td>
              <td className="border-t border-border/70 dark:border-white/10 px-4 py-3 text-sm text-muted-foreground">
                {sortedCampaigns.length} campanhas
              </td>
              <td className="border-t border-border/70 dark:border-white/10 px-4 py-3 font-semibold">
                {formatCurrency(totals.amountSpent)}
              </td>
              <td className="border-t border-border/70 dark:border-white/10 px-4 py-3 font-semibold">
                {totals.clicks.toLocaleString("pt-BR")}
              </td>
              <td className="border-t border-border/70 dark:border-white/10 px-4 py-3 font-semibold">
                {formatPercent(averageCtr)}
              </td>
              <td className="border-t border-border/70 dark:border-white/10 px-4 py-3 font-semibold">
                {totals.results.toLocaleString("pt-BR")}
              </td>
              <td className="border-t border-border/70 dark:border-white/10 px-4 py-3 font-semibold">
                {formatCurrency(averageCostPerLead)}
              </td>
              <td className="border-t border-border/70 dark:border-white/10 px-4 py-3 font-semibold">
                {formatMultiplier(averageRoas)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      </div>
    </div>
  );
}
