"use client";

import { useMemo, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORIGINS, type LeadOrigin } from "@/lib/leads-export/format";
import { cn } from "@/lib/utils";

export type ExportClientOption = { id: string; name: string; segment: string };

/** Data de hoje (e de 30 dias atrás) no horário de Brasília, AAAA-MM-DD. */
function brasiliaDay(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Último dia do mês de uma data AAAA-MM-DD. */
function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

// Atalhos de período, calculados no horário de Brasília.
const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: "Hoje", range: () => [brasiliaDay(), brasiliaDay()] },
  { label: "Ontem", range: () => [brasiliaDay(-1), brasiliaDay(-1)] },
  { label: "7 dias", range: () => [brasiliaDay(-6), brasiliaDay()] },
  { label: "30 dias", range: () => [brasiliaDay(-29), brasiliaDay()] },
  {
    label: "Este mês",
    range: () => {
      const today = brasiliaDay();
      return [`${today.slice(0, 8)}01`, today];
    },
  },
  {
    label: "Mês passado",
    range: () => {
      const [year, month] = brasiliaDay().split("-").map(Number);
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      return [
        `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`,
        monthEnd(prevYear, prevMonth),
      ];
    },
  },
];

export function LeadsExportPanel({ clients }: { clients: ExportClientOption[] }) {
  const [from, setFrom] = useState(() => brasiliaDay(-29));
  const [to, setTo] = useState(() => brasiliaDay());
  // Começa com todos os clientes marcados, como na seleção de campanhas.
  const [selected, setSelected] = useState<string[]>(() => clients.map((client) => client.id));
  const [origin, setOrigin] = useState<"all" | LeadOrigin>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? clients.filter((client) => client.name.toLowerCase().includes(term)) : clients;
  }, [clients, query]);

  const allSelected = clients.length > 0 && clients.every((client) => selected.includes(client.id));

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  async function download() {
    setMessage(null);
    if (!from || !to || from > to) {
      setMessage({ tone: "error", text: "Escolha um período válido." });
      return;
    }
    if (selected.length === 0) {
      setMessage({ tone: "error", text: "Selecione pelo menos um cliente." });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/leads-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          // Todos marcados = sem filtro (inclui clientes novos do nicho).
          clientIds: allSelected ? null : selected,
          origins: origin === "all" ? null : [origin],
          search: search.trim() || null,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setMessage({ tone: "error", text: body.error ?? "Não foi possível gerar a planilha." });
        return;
      }

      const blob = await response.blob();
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ??
        `Leads_Unificados_${from}_a_${to}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);

      const count = response.headers.get("X-Leads-Count");
      setMessage({
        tone: "ok",
        text: `Planilha gerada${count ? ` com ${count} lead${count === "1" ? "" : "s"}` : ""}.`,
      });
    } catch {
      setMessage({ tone: "error", text: "Sem conexão. Tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">Leads unificados</CardTitle>
        <p className="text-sm text-muted-foreground">
          Uma linha por lead, do mais recente para o mais antigo. O que não
          existir para o lead fica em branco.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Período rápido">
          {PRESETS.map((preset) => {
            const [presetFrom, presetTo] = preset.range();
            const active = presetFrom === from && presetTo === to;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setFrom(presetFrom);
                  setTo(presetTo);
                }}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "border-primary/30 bg-primary/12 text-primary"
                    : "border-border/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="export-from">Data inicial</Label>
            <Input id="export-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-to">Data final</Label>
            <Input id="export-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-origin">Origem</Label>
            <select
              id="export-origin"
              value={origin}
              onChange={(e) => setOrigin(e.target.value as "all" | LeadOrigin)}
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
            >
              <option value="all">Todas</option>
              {ORIGINS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="export-search">
            Leads específicos <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="export-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou telefone. Vários: separe por vírgula"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            Em branco, baixa todos os leads do período. Telefone vale com ou sem
            o 55 e com ou sem máscara.
          </p>
        </div>

        <fieldset className="min-w-0 space-y-3">
          <legend className="text-sm font-medium">Clientes</legend>
          <Input
            type="search"
            placeholder="Pesquisar cliente por nome"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Pesquisar cliente"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {selected.length} de {clients.length} cliente{clients.length === 1 ? "" : "s"}{" "}
              selecionado{selected.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className="font-medium text-primary transition hover:opacity-80"
              onClick={() => setSelected(allSelected ? [] : clients.map((client) => client.id))}
            >
              {allSelected ? "Limpar seleção" : "Selecionar todos"}
            </button>
          </div>
          <div className="dashboard-row min-w-0 rounded-[1.35rem] border p-2">
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                  {clients.length === 0
                    ? "Nenhum cliente dos nichos de quitação ou compra de veículos."
                    : "Nenhum cliente encontrado com esse nome."}
                </div>
              ) : (
                visible.map((client) => (
                  <label
                    key={client.id}
                    className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 bg-background/50 px-4 py-3 transition hover:border-primary/35 hover:bg-muted/70"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(client.id)}
                      onChange={() => toggle(client.id)}
                      className="mt-1 size-4 rounded border-border"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium text-foreground">{client.name}</p>
                      {client.segment ? (
                        <p className="break-words text-sm text-muted-foreground">{client.segment}</p>
                      ) : null}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={download} disabled={busy}>
            {busy ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            {busy ? "Gerando planilha..." : "Baixar planilha (.xlsx)"}
          </Button>
          {message ? (
            <p
              role="status"
              className={cn("text-sm", message.tone === "error" ? "text-destructive" : "text-emerald-700")}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
