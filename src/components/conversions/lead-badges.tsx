"use client";

import { useRef, useState } from "react";
import { CircleAlert, Send } from "lucide-react";
import { useDismiss } from "@/components/shell/use-dismiss";
import { readCapiError } from "@/lib/conversions/capi-error";
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

// Erro da CAPI: some para o cliente, aparece para o admin com a resposta da
// Meta organizada (código, explicação, fbtrace_id). O balão abre para a
// DIREITA do selo e nunca passa da largura da tela: o selo fica no canto
// esquerdo do cartão e, ancorado à direita, o balão era cortado pela lateral.
export function CapiErrorBadge({ lead }: { lead: ConversionLead }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const error = readCapiError(lead.capiResponse);

  useDismiss(containerRef, isOpen, () => setIsOpen(false));

  const rows: [string, string][] = [];
  if (error.code !== null) rows.push(["Código", String(error.code)]);
  if (error.subcode !== null) rows.push(["Subcódigo", String(error.subcode)]);
  if (error.httpStatus !== null) rows.push(["HTTP", String(error.httpStatus)]);
  if (error.fbtraceId) rows.push(["fbtrace_id", error.fbtraceId]);

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
        <span
          role="dialog"
          aria-label="Resposta da Meta"
          className="absolute left-0 top-[calc(100%+0.4rem)] z-40 block w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border/70 bg-popover p-3 text-left shadow-2xl"
        >
          <span className="block text-xs font-medium text-foreground">
            Resposta da Meta
          </span>
          <span className="mt-1 block text-[0.75rem] font-medium leading-5 text-destructive">
            {error.summary}
          </span>
          {rows.length ? (
            <span className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.7rem] leading-5">
              {rows.map(([label, value]) => (
                <span key={label} className="contents">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="break-all font-mono text-foreground">{value}</span>
                </span>
              ))}
            </span>
          ) : null}
          {error.detail && error.detail !== error.summary ? (
            <span className="mt-2 block text-[0.7rem] leading-5 text-muted-foreground">
              {error.detail}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
