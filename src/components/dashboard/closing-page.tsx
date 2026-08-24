"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, LoaderCircle, TriangleAlert } from "lucide-react";
import { ClosingCampaignFilter } from "@/components/dashboard/closing-campaign-filter";
import { TaxInfo } from "@/components/dashboard/tax-info";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClosingData } from "@/lib/data/closing";
import { CLOSING_PRESETS } from "@/lib/data/closing-window";
import {
  formatRate,
  ISS_RATE,
  META_TAX_INFO_URL,
  PIS_COFINS_RATE,
} from "@/lib/taxes";
import { cn } from "@/lib/utils";

function money(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number.isFinite(value) ? value : 0);
}

function integer(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

function diaCurto(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function horario(iso: string | null) {
  if (!iso) {
    return null;
  }

  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

export function ClosingPage({
  data,
  activePreset,
}: {
  data: ClosingData;
  activePreset: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [range, setRange] = useState({
    inicio: data.window.startDate,
    fim: data.window.endDate,
  });

  const isCustom = Boolean(searchParams.get("inicio") && searchParams.get("fim"));

  function applyPreset(preset: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", preset);
    params.delete("inicio");
    params.delete("fim");

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function applyRange() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("inicio", range.inicio);
    params.set("fim", range.fim);
    params.delete("preset");

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  // O PDF é gerado no servidor a partir dos MESMOS parâmetros da tela.
  const pdfParams = new URLSearchParams({
    inicio: data.window.startDate,
    fim: data.window.endDate,
  });
  const clientId = searchParams.get("cliente");
  if (clientId) {
    pdfParams.set("cliente", clientId);
  }
  for (const id of searchParams.getAll("campanha")) {
    if (id) {
      pdfParams.append("campanha", id);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-wrap items-center gap-2">
            {CLOSING_PRESETS.map((preset) => {
              const isActive = !isCustom && activePreset === preset.key;

              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset.key)}
                  className={cn(
                    "h-10 rounded-full border px-4 text-sm transition",
                    isActive
                      ? "border-primary bg-primary/[0.12] font-medium text-primary"
                      : "border-border/70 text-muted-foreground hover:text-foreground dark:border-white/10",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 space-y-1.5">
              <span className="block text-xs text-muted-foreground">
                Primeiro dia
              </span>
              <input
                type="date"
                value={range.inicio}
                max={range.fim}
                onChange={(event) =>
                  setRange((current) => ({ ...current, inicio: event.target.value }))
                }
                className="h-11 min-w-0 rounded-xl border border-border/70 bg-background/60 px-3 text-sm text-foreground outline-none focus:border-primary dark:border-white/10 dark:bg-black/25"
              />
            </label>

            <label className="min-w-0 space-y-1.5">
              <span className="block text-xs text-muted-foreground">Último dia</span>
              <input
                type="date"
                value={range.fim}
                min={range.inicio}
                onChange={(event) =>
                  setRange((current) => ({ ...current, fim: event.target.value }))
                }
                className="h-11 min-w-0 rounded-xl border border-border/70 bg-background/60 px-3 text-sm text-foreground outline-none focus:border-primary dark:border-white/10 dark:bg-black/25"
              />
            </label>

            <button
              type="button"
              onClick={applyRange}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border/70 px-5 text-sm font-medium text-foreground transition hover:border-primary/40 dark:border-white/10"
            >
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Aplicar dias
            </button>

            <a
              href={`/api/fechamento/pdf?${pdfParams.toString()}`}
              className="ml-auto inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary/90"
            >
              <Download className="size-4" />
              Baixar PDF
            </a>
          </div>

          <ClosingCampaignFilter
            key={`${data.window.startDate}:${data.window.endDate}:${data.clientName}:${data.selectedCampaignIds.join(",")}`}
            campaigns={data.campaignOptions}
            selectedIds={data.selectedCampaignIds}
            hasFilter={data.hasCampaignFilter}
          />

          <p className="text-sm text-muted-foreground">
            Fechamento de <strong className="text-foreground">{data.clientName}</strong>{" "}
            · {data.periodLabel} ({data.dayCount}{" "}
            {data.dayCount === 1 ? "dia" : "dias"}) · {data.selectedCampaignIds.length}{" "}
            {data.selectedCampaignIds.length === 1 ? "campanha" : "campanhas"}
          </p>

          {/* O último dia importado quase sempre está pela metade: a carga roda
              no meio do dia. Avisar evita fechar um período incompleto. */}
          {data.lastMetricDate && data.lastMetricDate < data.window.endDate ? (
            <p className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Os dados vão até{" "}
                <strong>{diaCurto(data.lastMetricDate)}</strong> e o período
                escolhido termina em{" "}
                <strong>{diaCurto(data.window.endDate)}</strong>. O último dia
                importado costuma vir incompleto — use{" "}
                <strong>Atualizar dados da Meta</strong> em Visão →
                Sincronização antes de fechar.
                {horario(data.syncedAt)
                  ? ` Última importação: ${horario(data.syncedAt)}.`
                  : ""}
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-5">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Total do período
              <TaxInfo />
            </p>
            <p className="mt-2 font-display text-3xl font-semibold text-foreground">
              {money(data.taxes.gross)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">Resultados</p>
            <p className="mt-2 font-display text-3xl font-semibold text-foreground">
              {integer(data.results)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">Custo por resultado</p>
            <p className="mt-2 font-display text-3xl font-semibold text-foreground">
              {data.results > 0 ? money(data.taxes.gross / data.results) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Campanhas incluídas no fechamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.campaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhuma campanha com investimento nos dias escolhidos.
            </div>
          ) : (
            <div className="min-w-0 overflow-x-auto rounded-2xl border border-border/60 dark:border-white/10">
              <table className="w-full min-w-[38rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground dark:border-white/10">
                    <th className="px-4 py-3 font-medium">Campanha</th>
                    <th className="px-4 py-3 text-right font-medium">Veiculação</th>
                    <th className="px-4 py-3 text-right font-medium">Resultados</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Custo/result.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-b border-border/40 last:border-b-0 dark:border-white/[0.06]"
                    >
                      <td className="max-w-[22rem] px-4 py-3">
                        <span className="block truncate text-foreground">
                          {campaign.name}
                        </span>
                        {campaign.clientName ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {campaign.clientName}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-foreground">
                        {money(campaign.amountSpent)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="text-foreground">
                          {integer(campaign.results)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {campaign.resultLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-foreground">
                        {campaign.results > 0
                          ? money(campaign.costPerResult)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Resumo para cobrança
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-border/60 dark:border-white/10">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-sm dark:border-white/10">
              <span className="text-muted-foreground">
                Veiculação de anúncios (valor da Meta)
              </span>
              <span className="text-foreground">{money(data.taxes.net)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-sm dark:border-white/10">
              <span className="text-muted-foreground">
                PIS/COFINS ({formatRate(PIS_COFINS_RATE)})
              </span>
              <span className="text-foreground">{money(data.taxes.pisCofins)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-sm dark:border-white/10">
              <span className="text-muted-foreground">
                ISS · Imposto Sobre Serviços ({formatRate(ISS_RATE)})
              </span>
              <span className="text-foreground">{money(data.taxes.iss)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-medium text-foreground">Total do período</span>
              <span className="font-display text-xl font-semibold text-primary">
                {money(data.taxes.gross)}
              </span>
            </div>
          </div>

          {data.currency !== "BRL" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">
                {data.mixedCurrencies
                  ? `Parte em ${data.currency}: ${money(data.foreignSpent)} (${money(data.amountSpentOriginal, data.currency)})`
                  : `Conta em ${data.currency}: ${money(data.amountSpentOriginal, data.currency)}`}
              </Badge>
              <Badge variant="secondary">
                Cotação média do período: {money(data.averageRate)}
              </Badge>
              <span className="text-xs">
                {data.mixedCurrencies
                  ? "O período junta contas em real e em dólar; a cotação vale só para a parte em dólar, convertida dia a dia."
                  : "Cada dia foi convertido pela cotação de fechamento daquele dia."}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Conta cobrada em reais — sem conversão de moeda neste período.
            </p>
          )}

          <p className="text-sm leading-6 text-muted-foreground">
            O Gerenciador de Anúncios mostra apenas a veiculação. Os impostos
            acima são cobrados pela Meta e discriminados na nota fiscal.{" "}
            <a
              href={META_TAX_INFO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-primary hover:underline"
            >
              Ver a explicação oficial da Meta
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
