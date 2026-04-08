"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  | "leads"
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
  { key: "leads", label: "Leads", className: "min-w-[88px]" },
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
    case "leads":
      return parseNumber(campaign.metrics.leads);
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
        acc.leads += parseNumber(campaign.metrics.leads);
        acc.costPerLead.push(parseCurrency(campaign.metrics.costPerLead));
        acc.roas.push(parseMultiplier(campaign.metrics.roas));
        return acc;
      },
      {
        amountSpent: 0,
        clicks: 0,
        ctr: [] as number[],
        leads: 0,
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
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-background/60">
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma campanha com métricas para o período selecionado.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-background/60">
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur">
            <tr>
              {columns.map((column) => {
                const active = sortKey === column.key;

                return (
                  <th
                    key={column.key}
                    className={cn(
                      "border-b border-border/60 px-4 py-3 font-medium",
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
              <tr key={campaign.id} className="border-b border-border/40 last:border-b-0">
                <td className="min-w-[260px] border-b border-border/40 px-4 py-3 align-middle">
                  <div>
                    <p className="font-medium leading-snug">{campaign.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{campaign.platform}</p>
                  </div>
                </td>
                <td className="min-w-[120px] border-b border-border/40 px-4 py-3 align-middle">
                  <Badge variant={campaign.status === "Ativa" ? "success" : "secondary"}>
                    {campaign.status}
                  </Badge>
                </td>
                <td className="min-w-[116px] border-b border-border/40 px-4 py-3 align-middle">
                  {campaign.metrics.amountSpent}
                </td>
                <td className="min-w-[90px] border-b border-border/40 px-4 py-3 align-middle">
                  {campaign.metrics.clicks}
                </td>
                <td className="min-w-[88px] border-b border-border/40 px-4 py-3 align-middle">
                  {campaign.metrics.ctr}
                </td>
                <td className="min-w-[88px] border-b border-border/40 px-4 py-3 align-middle">
                  {campaign.metrics.leads}
                </td>
                <td className="min-w-[108px] border-b border-border/40 px-4 py-3 align-middle">
                  {campaign.metrics.costPerLead}
                </td>
                <td className="min-w-[88px] border-b border-border/40 px-4 py-3 align-middle">
                  {campaign.metrics.roas}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-10 bg-card/95 backdrop-blur">
            <tr className="text-foreground">
              <td className="border-t border-border/60 px-4 py-3 font-semibold">Totais</td>
              <td className="border-t border-border/60 px-4 py-3 text-sm text-muted-foreground">
                {sortedCampaigns.length} campanhas
              </td>
              <td className="border-t border-border/60 px-4 py-3 font-semibold">
                {formatCurrency(totals.amountSpent)}
              </td>
              <td className="border-t border-border/60 px-4 py-3 font-semibold">
                {totals.clicks.toLocaleString("pt-BR")}
              </td>
              <td className="border-t border-border/60 px-4 py-3 font-semibold">
                {formatPercent(averageCtr)}
              </td>
              <td className="border-t border-border/60 px-4 py-3 font-semibold">
                {totals.leads.toLocaleString("pt-BR")}
              </td>
              <td className="border-t border-border/60 px-4 py-3 font-semibold">
                {formatCurrency(averageCostPerLead)}
              </td>
              <td className="border-t border-border/60 px-4 py-3 font-semibold">
                {formatMultiplier(averageRoas)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
