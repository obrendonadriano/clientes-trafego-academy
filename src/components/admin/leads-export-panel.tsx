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
  const [allClients, setAllClients] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [origin, setOrigin] = useState<"all" | LeadOrigin>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? clients.filter((client) => client.name.toLowerCase().includes(term)) : clients;
  }, [clients, query]);

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
    if (!allClients && selected.length === 0) {
      setMessage({ tone: "error", text: "Escolha pelo menos um cliente ou marque Todos." });
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
          clientIds: allClients ? null : selected,
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

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Clientes</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allClients}
              onChange={(e) => setAllClients(e.target.checked)}
            />
            Todos os clientes ({clients.length})
          </label>
          {!allClients ? (
            <div className="space-y-2 rounded-2xl border border-border/60 p-3">
              <Input
                type="search"
                placeholder="Buscar cliente"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar cliente"
              />
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {visible.map((client) => (
                  <li key={client.id}>
                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(client.id)}
                        onChange={() => toggle(client.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{client.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{client.segment}</span>
                    </label>
                  </li>
                ))}
                {visible.length === 0 ? (
                  <li className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum cliente encontrado.</li>
                ) : null}
              </ul>
              <p className="text-xs text-muted-foreground">{selected.length} selecionado(s)</p>
            </div>
          ) : null}
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
