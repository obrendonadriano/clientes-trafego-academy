"use client";

import * as React from "react";
import { Info, LoaderCircle } from "lucide-react";
import { toggleAdLevelStatusAction } from "@/app/admin/campanhas/actions";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TaxInfo } from "@/components/dashboard/tax-info";
import type { AdLevelRow } from "@/lib/data/ad-levels";
import { withMetaTaxes } from "@/lib/taxes";

type AdLevelTableProps = {
  level: "adset" | "ad";
  rows: AdLevelRow[];
  notice?: string;
  editable?: boolean;
};

function money(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number) {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

function EntityStatus({
  level,
  row,
  editable,
}: {
  level: "adset" | "ad";
  row: AdLevelRow;
  editable: boolean;
}) {
  const [active, setActive] = React.useState(row.status === "Ativa");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const statusAvailable = row.status !== "Não sincronizado";

  if (!editable) {
    return (
      <Badge variant={active ? "success" : "secondary"}>
        {statusAvailable ? (active ? "Ativa" : "Pausada") : "Não sincronizado"}
      </Badge>
    );
  }

  function toggle(next: boolean) {
    setActive(next);
    setError(null);
    startTransition(async () => {
      const result = await toggleAdLevelStatusAction(level, row.id, next);
      if (result.error) {
        setActive(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Switch
          checked={active}
          disabled={pending || !statusAvailable}
          onChange={(event) => toggle(event.target.checked)}
          aria-label={active ? `Pausar ${row.name}` : `Ativar ${row.name}`}
        />
        {pending ? (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <span className="text-xs text-muted-foreground">
            {statusAvailable ? (active ? "Ativa" : "Pausada") : "Sincronize"}
          </span>
        )}
      </div>
      {error ? <p className="mt-1 max-w-48 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function AdLevelTable({
  level,
  rows,
  notice,
  editable = false,
}: AdLevelTableProps) {
  const sortedRows = React.useMemo(
    () => [...rows].sort((a, b) => b.amountSpent - a.amountSpent),
    [rows],
  );
  const totals = React.useMemo(
    () =>
      sortedRows.reduce(
        (total, row) => ({
          amountSpent: total.amountSpent + row.amountSpent,
          clicks: total.clicks + row.clicks,
          impressions: total.impressions + row.impressions,
          results: total.results + row.results,
        }),
        { amountSpent: 0, clicks: 0, impressions: 0, results: 0 },
      ),
    [sortedRows],
  );
  const entityLabel = level === "adset" ? "Conjunto" : "Anúncio";
  const pluralLabel = level === "adset" ? "conjuntos" : "anúncios";

  return (
    <div className="min-w-0 space-y-4">
      {notice ? (
        <p className="flex items-start gap-2 rounded-[0.875rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          {notice}
        </p>
      ) : null}

      {sortedRows.length === 0 ? (
        <div className="dashboard-card overflow-hidden rounded-[0.875rem] border">
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum {pluralLabel} com métricas para o período selecionado.
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {sortedRows.map((row) => (
              <div
                key={row.id}
                className="dashboard-card rounded-[0.875rem] border p-4 text-foreground"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{row.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {level === "ad" && row.adSetName
                        ? `${row.campaignName} · ${row.adSetName}`
                        : row.campaignName}
                    </p>
                  </div>
                  <EntityStatus level={level} row={row} editable={editable} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                    <p className="text-xs text-muted-foreground">Investido</p>
                    <p className="mt-0.5 font-semibold">
                      {money(withMetaTaxes(row.amountSpent))}
                    </p>
                    {row.currency !== "BRL" ? (
                      <p className="text-xs text-muted-foreground">
                        {money(withMetaTaxes(row.amountSpentOriginal), row.currency)}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                    <p className="text-xs text-muted-foreground">Resultados</p>
                    <p className="mt-0.5 font-semibold">{row.results}</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                    <p className="text-xs text-muted-foreground">Cliques</p>
                    <p className="mt-0.5 font-semibold">{row.clicks}</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 px-3 py-2 dark:bg-white/[0.045]">
                    <p className="text-xs text-muted-foreground">CTR</p>
                    <p className="mt-0.5 font-semibold">{percent(row.ctr)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="dashboard-card hidden overflow-hidden rounded-[0.875rem] border text-foreground md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur dark:bg-[#111525]/95">
                  <tr>
                    {[entityLabel, "Status", "Investido", "Cliques", "CTR", "Resultados", "Custo/result.", "ROAS"].map((label) => (
                      <th
                        key={label}
                        className="border-b border-border/70 px-4 py-3 font-medium dark:border-white/10"
                      >
                        {label}
                        {label === "Investido" ? <TaxInfo className="ml-1.5 align-middle" /> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="min-w-[260px] border-b border-border/60 px-4 py-3 align-middle dark:border-white/10">
                        <p className="font-medium leading-snug text-foreground">{row.name}</p>
                        <p className="mt-0.5 max-w-[300px] truncate text-xs text-muted-foreground">
                          {level === "ad" && row.adSetName
                            ? `${row.campaignName} · ${row.adSetName}`
                            : row.campaignName}
                        </p>
                      </td>
                      <td className="min-w-[120px] border-b border-border/60 px-4 py-3 align-middle dark:border-white/10">
                        <EntityStatus level={level} row={row} editable={editable} />
                      </td>
                      <td className="min-w-[116px] border-b border-border/60 px-4 py-3 align-middle dark:border-white/10">
                        {money(withMetaTaxes(row.amountSpent))}
                        {row.currency !== "BRL" ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {money(withMetaTaxes(row.amountSpentOriginal), row.currency)}
                          </span>
                        ) : null}
                      </td>
                      <td className="border-b border-border/60 px-4 py-3 dark:border-white/10">{row.clicks}</td>
                      <td className="border-b border-border/60 px-4 py-3 dark:border-white/10">{percent(row.ctr)}</td>
                      <td className="border-b border-border/60 px-4 py-3 dark:border-white/10">
                        <p className="font-medium leading-none">{row.results}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{row.resultLabel}</p>
                      </td>
                      <td className="border-b border-border/60 px-4 py-3 dark:border-white/10">
                        {row.results > 0 ? money(row.costPerResult) : "—"}
                        {row.currency !== "BRL" && row.results > 0 ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {money(row.amountSpentOriginal / row.results, row.currency)}
                          </span>
                        ) : null}
                      </td>
                      <td className="border-b border-border/60 px-4 py-3 dark:border-white/10">0,00x</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-card">
                  <tr>
                    <td className="border-t border-border/70 px-4 py-3 font-semibold dark:border-white/10">Totais</td>
                    <td className="border-t border-border/70 px-4 py-3 text-muted-foreground dark:border-white/10">
                      {sortedRows.length} {pluralLabel}
                    </td>
                    <td className="border-t border-border/70 px-4 py-3 font-semibold dark:border-white/10">
                      {money(withMetaTaxes(totals.amountSpent))}
                    </td>
                    <td className="border-t border-border/70 px-4 py-3 font-semibold dark:border-white/10">{totals.clicks}</td>
                    <td className="border-t border-border/70 px-4 py-3 font-semibold dark:border-white/10">
                      {percent(totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0)}
                    </td>
                    <td className="border-t border-border/70 px-4 py-3 font-semibold dark:border-white/10">{totals.results}</td>
                    <td className="border-t border-border/70 px-4 py-3 font-semibold dark:border-white/10">
                      {totals.results > 0 ? money(totals.amountSpent / totals.results) : "—"}
                    </td>
                    <td className="border-t border-border/70 px-4 py-3 font-semibold dark:border-white/10">0,00x</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
