"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, Info, Search, Unlink, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BudgetReport, BudgetRow, BudgetStatus } from "@/lib/ad-budget";
import { cn } from "@/lib/utils";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function money(value: number) {
  return brl.format(value);
}

function day(value: string | null | undefined) {
  if (!value) return "—";
  const [, month, dayOfMonth] = value.split("-");
  return `${dayOfMonth}/${month}`;
}

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  estourado: "Gastou mais que pagou",
  acima: "Ritmo acima do pago",
  sem_pagamento: "Sem pagamento recente",
  abaixo: "Gastando menos",
  ok: "Em dia",
  parado: "Parado",
};

const STATUS_CLASS: Record<BudgetStatus, string> = {
  estourado: "bg-red-500/10 text-red-600 dark:text-red-400",
  acima: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  sem_pagamento: "bg-orange-500/12 text-orange-700 dark:text-orange-400",
  abaixo: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  ok: "bg-[#ecfdf3] text-[#067647] dark:bg-emerald-500/10 dark:text-emerald-400",
  parado: "bg-secondary text-text-3",
};

const ATTENTION: BudgetStatus[] = ["estourado", "acima", "sem_pagamento"];

type Filter = "atencao" | "abaixo" | "todos";

function matchesFilter(row: BudgetRow, filter: Filter) {
  if (filter === "todos") return true;
  if (filter === "abaixo") return row.status === "abaixo";
  return ATTENTION.includes(row.status);
}

function underText(row: BudgetRow) {
  if (row.underReason === "sobra") {
    return `${money(row.balance)} guardado, mais que uma verba inteira`;
  }
  return row.pacePercent !== null
    ? `Usando só ${row.pacePercent}% do que pode por dia`
    : "Ritmo abaixo do combinado";
}

export function AdBudgetPanel({ report }: { report: BudgetReport }) {
  const attentionCount = report.rows.filter((row) =>
    ATTENTION.includes(row.status),
  ).length;
  const underCount = report.rows.filter((row) => row.status === "abaixo").length;
  const [filter, setFilter] = useState<Filter>(
    attentionCount > 0 ? "atencao" : "todos",
  );
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return report.rows.filter(
      (row) =>
        matchesFilter(row, filter) &&
        (!term ||
          row.clientName.toLowerCase().includes(term) ||
          row.code.includes(term) ||
          row.controlNames.some((name) => name.toLowerCase().includes(term))),
    );
  }, [report.rows, filter, query]);

  const taxLabel = `${(report.taxRate * 100).toFixed(2).replace(".", ",")}%`;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile label="Verba paga (desde o início)" value={money(report.totals.verbaPaid)} />
        <SummaryTile label={`Gasto real na Meta (+${taxLabel})`} value={money(report.totals.spendGross)} />
        <SummaryTile
          label="Saldo dos clientes em caixa"
          value={money(report.totals.balance)}
          hint={`${money(report.totals.unspent)} pago e ainda não gasto`}
          tone={report.totals.balance < 0 ? "bad" : undefined}
        />
        <SummaryTile
          label="Gastando mais"
          value={String(attentionCount)}
          hint={`${report.totals.estourados} estourado(s) · ${report.totals.acima} acima do ritmo · ${report.totals.semPagamento} sem pagamento`}
          tone={attentionCount > 0 ? "warn" : undefined}
        />
        <SummaryTile
          label="Gastando menos"
          value={String(underCount)}
          hint="Abaixo de 70% do combinado ou com mais de uma verba guardada"
          tone={underCount > 0 ? "info" : undefined}
        />
      </div>

      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/12 p-3 text-primary">
              <Wallet className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <CardTitle className="font-display text-xl">Verba x gasto por cliente</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Pagamentos do controle comparados com o que a Meta cobrou, já com os impostos.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex rounded-xl border border-border/70 p-0.5 text-sm">
              {(
                [
                  ["atencao", `Gastando mais (${attentionCount})`],
                  ["abaixo", `Gastando menos (${underCount})`],
                  ["todos", `Todos (${report.rows.length})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-[10px] px-3 py-1.5 font-medium transition",
                    filter === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cliente ou código"
                className="h-9 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-60"
              />
            </label>
          </div>
        </CardHeader>

        <CardContent>
          {report.rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum cliente ligado ainda. No sistema de controle, coloque no campo
              Empresa o código de 4 dígitos do cliente: <strong>1234 - Nome da empresa</strong>.
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              {query
                ? "Nenhum cliente encontrado."
                : filter === "atencao"
                  ? "Nenhum cliente gastando além do que pagou."
                  : filter === "abaixo"
                    ? "Nenhum cliente gastando bem menos do que pagou."
                    : "Nenhum cliente encontrado."}
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[70rem] border-separate border-spacing-y-1.5 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 pb-1 font-medium">Cliente</th>
                      <th className="px-3 pb-1 font-medium">Situação</th>
                      <th className="px-3 pb-1 text-right font-medium">Verba paga</th>
                      <th className="px-3 pb-1 text-right font-medium">Gasto real</th>
                      <th className="px-3 pb-1 text-right font-medium">Saldo</th>
                      <th className="px-3 pb-1 text-right font-medium">Gasto/dia</th>
                      <th className="px-3 pb-1 text-right font-medium">Pode/dia</th>
                      <th className="px-3 pb-1 text-right font-medium">Uso</th>
                      <th className="px-3 pb-1 font-medium">Última verba</th>
                      <th className="px-3 pb-1 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.code}
                        className="bg-background/60 [&>td]:border-y [&>td]:border-border/60 [&>td]:px-3 [&>td]:py-3 [&>td:first-child]:rounded-l-2xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-2xl [&>td:last-child]:border-r"
                      >
                        <td>
                          <p className="font-medium text-foreground">{row.clientName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.code} · desde {day(row.startDate)} · {row.activeCampaigns} campanha(s) ativa(s)
                          </p>
                        </td>
                        <td>
                          <StatusBadge status={row.status} />
                          {row.status === "abaixo" ? (
                            <p className="mt-1 max-w-[12rem] text-xs text-muted-foreground">
                              {underText(row)}
                            </p>
                          ) : null}
                        </td>
                        <td className="text-right tabular-nums">{money(row.verbaPaid)}</td>
                        <td className="text-right tabular-nums">{money(row.spendGross)}</td>
                        <td
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            row.balance < 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
                          )}
                        >
                          {money(row.balance)}
                        </td>
                        <td
                          className={cn(
                            "text-right tabular-nums",
                            row.status === "acima" && "font-semibold text-amber-700 dark:text-amber-400",
                            row.status === "abaixo" && row.underReason === "ritmo" && "font-semibold text-sky-700 dark:text-sky-400",
                          )}
                        >
                          {money(row.paceDaily)}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {row.recommendedDaily > 0 ? money(row.recommendedDaily) : "—"}
                        </td>
                        <td className="text-right">
                          <PaceBar percent={row.pacePercent} />
                        </td>
                        <td className="text-muted-foreground">
                          {row.lastPaid ? (
                            <>
                              {money(row.lastPaid.amount)}{" "}
                              <span className="text-xs">em {day(row.lastPaid.date)}</span>
                            </>
                          ) : (
                            "—"
                          )}
                          {row.overdueVerba > 0 ? (
                            <p className="text-xs font-medium text-orange-700 dark:text-orange-400">
                              {money(row.overdueVerba)} em atraso
                            </p>
                          ) : null}
                        </td>
                        <td>
                          <CampaignsLink clientId={row.clientId} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 lg:hidden">
                {rows.map((row) => (
                  <MobileRow key={row.code} row={row} />
                ))}
              </div>
            </>
          )}

          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Gasto real = gasto do Gerenciador + {taxLabel} de impostos. Gasto/dia = média
              dos últimos 3 dias completos. Pode/dia = última verba − {taxLabel}, dividida
              pelos dias do ciclo (semanal = 7). Conta antiga em dólar convertida a{" "}
              {brl.format(report.usdRate)}. Desativar campanhas continua sendo manual.
            </span>
          </p>
        </CardContent>
      </Card>

      {report.withoutControl.length > 0 ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Gastando sem pagamento ligado no controle</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Clientes com gasto nos últimos 7 dias que ainda não têm cadastro com código no controle.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.withoutControl.map((item) => (
              <div
                key={item.clientId}
                className="dashboard-row flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
              >
                <span>
                  <strong className="text-foreground">{item.clientName}</strong>{" "}
                  <span className="text-muted-foreground">· código {item.code ?? "sem código"}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{money(item.spendLast7)} em 7 dias</span>
                  <CampaignsLink clientId={item.clientId} />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {report.unlinked.length > 0 ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Unlink className="size-4" /> Sem vínculo ({report.unlinked.length})
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastros do controle com verba que não foram ligados. Ajuste o campo Empresa no
              controle para <strong>1234 - Nome da empresa</strong>, usando o código do cliente aqui.
            </p>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {report.unlinked.map((item) => (
              <div
                key={item.controlId}
                className="dashboard-row flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <strong className="block truncate text-foreground">{item.name || "Sem nome"}</strong>
                  <span className="block truncate text-xs text-muted-foreground">
                    Empresa: {item.company || "vazio"} ·{" "}
                    {item.reason === "sem_codigo"
                      ? "sem código"
                      : `código ${item.code} não existe aqui`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {money(item.verbaPaid)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: BudgetStatus }) {
  return <Badge className={STATUS_CLASS[status]}>{BUDGET_STATUS_LABEL[status]}</Badge>;
}

function CampaignsLink({ clientId }: { clientId: string }) {
  return (
    <Link
      href={`/admin/campanhas?cliente=${clientId}`}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
    >
      Campanhas
      <ExternalLink className="size-3.5" />
    </Link>
  );
}

function MobileRow({ row }: { row: BudgetRow }) {
  return (
    <div className="dashboard-row rounded-2xl border p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.clientName}</p>
          <p className="text-xs text-muted-foreground">
            {row.code} · desde {day(row.startDate)}
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      {row.status === "abaixo" ? (
        <p className="mt-2 text-xs text-sky-700 dark:text-sky-400">{underText(row)}</p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="Verba paga" value={money(row.verbaPaid)} />
        <Stat label="Gasto real" value={money(row.spendGross)} />
        <Stat label="Saldo" value={money(row.balance)} bad={row.balance < 0} />
        <Stat
          label="Gasto/dia · pode/dia"
          value={`${money(row.paceDaily)} · ${row.recommendedDaily > 0 ? money(row.recommendedDaily) : "—"}`}
        />
      </dl>
      {row.pacePercent !== null ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Uso do que pode gastar por dia</span>
          <PaceBar percent={row.pacePercent} />
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {row.lastPaid ? `Última verba ${money(row.lastPaid.amount)} em ${day(row.lastPaid.date)}` : "Sem verba paga"}
        </span>
        <CampaignsLink clientId={row.clientId} />
      </div>
    </div>
  );
}

// Barra do ritmo atual em % do combinado: 100% é exatamente o que a verba
// permite. Azul abaixo de 70%, verde no meio, âmbar acima de 110%.
function PaceBar({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const color =
    percent > 110 ? "bg-amber-500" : percent < 70 ? "bg-sky-500" : "bg-emerald-500";

  return (
    <span className="inline-flex items-center justify-end gap-2" title={`${percent}% do combinado`}>
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", color)}
          style={{ width: `${Math.min(100, percent / 1.5)}%` }}
        />
        <span className="absolute inset-y-0 left-2/3 w-px bg-foreground/40" />
      </span>
      <span className="w-10 text-right tabular-nums text-foreground">{percent}%</span>
    </span>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", bad ? "font-semibold text-red-600 dark:text-red-400" : "text-foreground")}>
        {value}
      </dd>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "bad" | "warn" | "info";
}) {
  return (
    <div className="dashboard-card rounded-[1.5rem] border px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg tracking-[-0.02em] tabular-nums",
          tone === "bad"
            ? "text-red-600 dark:text-red-400"
            : tone === "warn"
              ? "text-amber-700 dark:text-amber-400"
              : tone === "info"
                ? "text-sky-700 dark:text-sky-400"
                : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
