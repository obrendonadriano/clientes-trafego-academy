"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { BarChart3, Search, Users } from "lucide-react";
import { useScopedHref } from "@/components/shell/period-scope";
import { useDismiss } from "@/components/shell/use-dismiss";
import { cn } from "@/lib/utils";

export type SearchEntry = {
  id: string;
  label: string;
  detail?: string;
  kind: "cliente" | "campanha";
  href: string;
};

// Busca de clientes e campanhas na topbar. Navega direto para o item.
export function GlobalSearch({ entries }: { entries: SearchEntry[] }) {
  const router = useRouter();
  const scopedHref = useScopedHref();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismiss(containerRef, isOpen, () => setIsOpen(false));

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return [];
    }

    return entries
      .filter(
        (entry) =>
          entry.label.toLowerCase().includes(term) ||
          entry.detail?.toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [entries, query]);

  function go(entry: SearchEntry) {
    setIsOpen(false);
    setQuery("");
    router.push(scopedHref(entry.href));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + results.length) % results.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const entry = results[highlighted] ?? results[0];
      if (entry) {
        go(entry);
      }
    }
  }

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-[21rem]" ref={containerRef}>
      <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-primary/50">
        <Search className="size-[0.9rem] shrink-0 opacity-55" strokeWidth={2} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar cliente ou campanha"
          aria-label="Buscar cliente ou campanha"
          className="min-w-0 flex-1 bg-transparent text-[0.8rem] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {isOpen && query.trim() ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/70 bg-popover p-1.5 shadow-2xl dark:border-white/10">
          {results.length === 0 ? (
            <p className="px-2.5 py-3 text-sm text-muted-foreground">
              Nada encontrado para “{query.trim()}”.
            </p>
          ) : (
            results.map((entry, index) => (
              <button
                key={`${entry.kind}-${entry.id}`}
                type="button"
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => go(entry)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                  index === highlighted
                    ? "bg-muted dark:bg-white/[0.07]"
                    : "hover:bg-muted dark:hover:bg-white/[0.07]",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/[0.12] text-primary">
                  {entry.kind === "cliente" ? (
                    <Users className="size-3.5" strokeWidth={1.75} />
                  ) : (
                    <BarChart3 className="size-3.5" strokeWidth={1.75} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.82rem] text-foreground">
                    {entry.label}
                  </span>
                  <span className="block truncate text-[0.7rem] text-muted-foreground">
                    {entry.detail ??
                      (entry.kind === "cliente" ? "Cliente" : "Campanha")}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
