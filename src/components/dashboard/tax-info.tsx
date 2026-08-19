"use client";

import { useRef, useState } from "react";
import { ExternalLink, HelpCircle } from "lucide-react";
import { useDismiss } from "@/components/shell/use-dismiss";
import {
  formatRate,
  ISS_RATE,
  META_TAX_INFO_URL,
  META_TAX_RATE,
  PIS_COFINS_RATE,
} from "@/lib/taxes";
import { cn } from "@/lib/utils";

const SUMMARY = `Inclui ${formatRate(META_TAX_RATE)} de impostos cobrados pela Meta no Brasil (PIS/COFINS ${formatRate(PIS_COFINS_RATE)} + ISS ${formatRate(ISS_RATE)}).`;

// O "(?)" ao lado de todo valor investido: abre no clique (ou no hover, via
// title nativo) a explicação dos impostos e o link para a página da Meta.
export function TaxInfo({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useDismiss(containerRef, isOpen, () => setIsOpen(false));

  return (
    <span className={cn("relative inline-flex", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label="Por que este valor inclui impostos?"
        title={SUMMARY}
        className="grid size-[1.05rem] shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-primary"
      >
        <HelpCircle className="size-[1.05rem]" strokeWidth={1.75} />
      </button>

      {isOpen ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+0.5rem)] z-40 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-border/70 bg-popover p-3 text-left shadow-2xl dark:border-white/10"
        >
          <span className="block text-sm font-medium text-foreground">
            Por que o valor é maior que na Meta?
          </span>
          <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
            O Gerenciador de Anúncios mostra só a veiculação. Sobre ela, a Meta
            cobra os impostos brasileiros que aparecem na nota fiscal — e o
            painel já soma os dois para você ver o custo real.
          </span>

          <span className="mt-2.5 block overflow-hidden rounded-lg border border-border/60 dark:border-white/10">
            <span className="flex items-center justify-between gap-3 border-b border-border/60 px-2.5 py-1.5 text-xs dark:border-white/10">
              <span className="text-muted-foreground">PIS/COFINS</span>
              <span className="text-foreground">{formatRate(PIS_COFINS_RATE)}</span>
            </span>
            <span className="flex items-center justify-between gap-3 border-b border-border/60 px-2.5 py-1.5 text-xs dark:border-white/10">
              <span className="text-muted-foreground">
                ISS (Imposto Sobre Serviços)
              </span>
              <span className="text-foreground">{formatRate(ISS_RATE)}</span>
            </span>
            <span className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs">
              <span className="font-medium text-foreground">Total</span>
              <span className="font-medium text-primary">
                {formatRate(META_TAX_RATE)}
              </span>
            </span>
          </span>

          <a
            href={META_TAX_INFO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            Ver a explicação oficial da Meta
            <ExternalLink className="size-3" />
          </a>
        </span>
      ) : null}
    </span>
  );
}
