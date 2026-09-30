"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);

  useDismiss(containerRef, isOpen, () => setIsOpen(false));

  // Atalho ⌘K / Ctrl+K foca a busca de qualquer tela.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    <div className="relative min-w-0 flex-1" ref={containerRef}>
      <label className="flex h-10 min-w-0 cursor-text items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 text-text-4 transition hover:border-input hover:bg-card focus-within:border-primary focus-within:bg-card focus-within:shadow-[0_0_0_4px_var(--ring)]">
        <Search className="size-[17px] shrink-0" strokeWidth={1.75} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar cliente, campanha..."
          aria-label="Buscar cliente ou campanha"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-text-4"
        />
        <span className="flex shrink-0 gap-[3px]" aria-hidden="true">
          <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">⌘</kbd>
          <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">K</kbd>
        </span>
      </label>

      {isOpen && query.trim() ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-full min-w-[18rem] overflow-hidden rounded-2xl border border-border bg-popover animate-ta-in p-1.5 shadow-[0_24px_48px_-12px_rgba(16,24,40,0.18)]">
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
                    ? "bg-surface-2"
                    : "hover:bg-surface-2",
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-700">
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
