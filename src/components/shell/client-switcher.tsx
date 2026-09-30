"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { usePeriodScope } from "@/components/shell/period-scope";
import { useDismiss } from "@/components/shell/use-dismiss";
import { cn } from "@/lib/utils";

export type ClientOption = {
  id: string;
  name: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

// Escopo global de cliente do admin: grava `?cliente=` e as páginas filtram.
export function ClientSwitcher({
  clients,
  className,
  buttonClassName,
}: {
  clients: ClientOption[];
  className?: string;
  buttonClassName?: string;
}) {
  const scope = usePeriodScope();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useDismiss(containerRef, isOpen, () => setIsOpen(false));

  const selected = clients.find((client) => client.id === scope.clientId) ?? null;
  const label = selected?.name ?? "Todos os clientes";

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return clients;
    }

    return clients.filter((client) => client.name.toLowerCase().includes(term));
  }, [clients, query]);

  function choose(clientId: string | null) {
    scope.setClientId(clientId);
    setIsOpen(false);
    setQuery("");
  }

  return (
    <div className={cn("relative min-w-0", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex h-9 min-w-0 max-w-[17rem] items-center gap-2 rounded-[10px] border border-border bg-card px-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2",
          buttonClassName,
        )}
      >
        <span className="grid size-[1.35rem] shrink-0 place-items-center rounded-md bg-brand-100 text-[0.65rem] font-semibold text-brand-700">
          {selected ? initials(selected.name) : "TA"}
        </span>
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {isOpen ? (
        <div
          role="listbox"
          aria-label="Selecionar cliente"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-popover animate-ta-in shadow-[0_24px_48px_-12px_rgba(16,24,40,0.18)]"
        >
          <div className="border-b border-line-soft p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrar clientes"
              className="h-9 w-full rounded-[10px] border border-border bg-surface-2 px-2.5 text-sm text-foreground outline-none placeholder:text-text-4 focus:border-primary focus:bg-card"
            />
          </div>

          <div className="max-h-[17rem] overflow-y-auto p-1.5">
            <button
              type="button"
              role="option"
              aria-selected={!selected}
              onClick={() => choose(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                !selected
                  ? "bg-brand-50 text-brand-700"
                  : "text-foreground hover:bg-surface-2",
              )}
            >
              <span className="min-w-0 flex-1 truncate">Todos os clientes</span>
              {!selected ? <Check className="size-4 shrink-0" /> : null}
            </button>

            {filtered.map((client) => {
              const isSelected = client.id === selected?.id;

              return (
                <button
                  key={client.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(client.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                    isSelected
                      ? "bg-brand-50 text-brand-700"
                      : "text-foreground hover:bg-surface-2",
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[0.65rem] font-semibold text-muted-foreground">
                    {initials(client.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{client.name}</span>
                  {isSelected ? <Check className="size-4 shrink-0" /> : null}
                </button>
              );
            })}

            {filtered.length === 0 ? (
              <p className="px-2.5 py-3 text-sm text-muted-foreground">
                Nenhum cliente encontrado.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
