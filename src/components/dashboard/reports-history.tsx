"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Copy, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ReportHistoryItem } from "@/lib/types";

function formatDate(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

type ReportsHistoryProps = {
  reports: ReportHistoryItem[];
  // No portal do cliente não faz sentido mostrar o nome do cliente em cada item.
  showClientName?: boolean;
  emptyMessage?: string;
};

// Lista de relatórios já gerados: sub-aba "Histórico" do admin e "Recebidos"
// do cliente.
export function ReportsHistory({
  reports,
  showClientName = true,
  emptyMessage = "Nenhum relatório gerado ainda.",
}: ReportsHistoryProps) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(reports[0]?.id ?? null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return reports;
    }

    return reports.filter(
      (report) =>
        report.clientName.toLowerCase().includes(term) ||
        report.periodLabel.toLowerCase().includes(term) ||
        report.preview.toLowerCase().includes(term),
    );
  }, [query, reports]);

  async function copy(report: ReportHistoryItem) {
    const text = report.generatedText || report.preview;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(report.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 px-4 py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-11"
            placeholder="Buscar por cliente, período ou trecho"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Badge variant="secondary">
          {filtered.length} {filtered.length === 1 ? "relatório" : "relatórios"}
        </Badge>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum relatório encontrado com essa busca.
        </div>
      ) : null}

      <div className="space-y-3">
        {filtered.map((report) => {
          const isOpen = openId === report.id;
          const createdAt = formatDate(report.createdAt);

          return (
            <div
              key={report.id}
              className="dashboard-row min-w-0 rounded-2xl border p-4"
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : report.id)}
                aria-expanded={isOpen}
                className="flex w-full min-w-0 items-start gap-3 text-left"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/[0.12] text-primary">
                  <Sparkles className="size-4" />
                </span>

                <span className="min-w-0 flex-1">
                  {showClientName ? (
                    <span className="block truncate font-semibold text-foreground">
                      {report.clientName}
                    </span>
                  ) : null}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarRange className="size-3.5" />
                      {report.periodLabel}
                    </span>
                    {createdAt ? <span>Gerado em {createdAt}</span> : null}
                  </span>
                  {!isOpen ? (
                    <span className="mt-2 line-clamp-2 block text-sm leading-6 text-muted-foreground">
                      {report.preview}
                    </span>
                  ) : null}
                </span>
              </button>

              {isOpen ? (
                <div className="mt-3 space-y-3">
                  <p className="whitespace-pre-wrap rounded-2xl border border-border/60 bg-background/50 px-4 py-3 text-sm leading-7 text-foreground dark:border-white/10 dark:bg-white/[0.03]">
                    {report.generatedText || report.preview}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copy(report)}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-border/70 px-4 text-sm text-foreground transition hover:border-primary/40 dark:border-white/10"
                    >
                      <Copy className="size-3.5" />
                      {copiedId === report.id ? "Copiado!" : "Copiar texto"}
                    </button>

                    {report.whatsapp ? (
                      <a
                        href={`https://wa.me/${report.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(report.generatedText || report.preview)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary/90"
                      >
                        Enviar no WhatsApp
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
