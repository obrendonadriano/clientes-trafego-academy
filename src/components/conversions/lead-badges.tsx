"use client";

import { useRef, useState } from "react";
import { CircleAlert, Send } from "lucide-react";
import { useDismiss } from "@/components/shell/use-dismiss";
import type { ConversionLead } from "@/lib/conversions/shared";

function shortDate(iso: string | null) {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

// Já enviado ao Meta: a marcação ainda pode mudar (os relatórios do cliente
// ficam certos), mas o evento enviado não volta atrás.
export function AlreadySentWarning({ sentAt }: { sentAt: string | null }) {
  const dia = shortDate(sentAt);
  const texto = dia
    ? `Já enviado ao Meta em ${dia}. A alteração vale para seus relatórios, mas o evento enviado não é desfeito.`
    : "Já enviado ao Meta. A alteração vale para seus relatórios, mas o evento enviado não é desfeito.";

  return (
    <span
      title={texto}
      className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground"
    >
      <Send className="size-3.5" aria-hidden />
      Enviado{dia ? ` ${dia}` : ""}
      <span className="sr-only">{texto}</span>
    </span>
  );
}

// Erro da CAPI: some para o cliente, aparece para o admin com a resposta crua.
export function CapiErrorBadge({ lead }: { lead: ConversionLead }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useDismiss(containerRef, isOpen, () => setIsOpen(false));

  return (
    <span className="relative inline-flex" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[0.7rem] font-medium text-destructive transition hover:bg-destructive/20"
      >
        <CircleAlert className="size-3.5" aria-hidden />
        Erro no envio
      </button>

      {isOpen ? (
        <span className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-[min(24rem,calc(100vw-3rem))] rounded-xl border border-border/70 bg-popover p-3 text-left shadow-2xl dark:border-white/10">
          <span className="block text-xs font-medium text-foreground">
            Resposta da Meta
          </span>
          <span className="mt-1.5 block max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[0.7rem] leading-5 text-muted-foreground">
            {lead.capiResponse || "A Meta não devolveu detalhes do erro."}
          </span>
        </span>
      ) : null}
    </span>
  );
}
