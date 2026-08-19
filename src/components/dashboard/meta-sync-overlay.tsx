"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import metaLogo from "../../../Meta-Logo.png";

export function MetaSyncOverlay({ open }: { open: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 px-4 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meta-sync-title"
        aria-describedby="meta-sync-description"
        aria-busy="true"
        aria-live="polite"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            event.preventDefault();
          }
        }}
        className="dashboard-card relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-card px-6 py-8 text-center shadow-2xl outline-none sm:px-9 sm:py-10"
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-24 rounded-full bg-[#1687ff]/20 blur-3xl" />

        <div className="relative mx-auto flex h-20 w-52 items-center justify-center overflow-hidden rounded-2xl bg-white px-3 shadow-sm">
          <Image
            src={metaLogo}
            alt="Meta"
            className="h-auto w-full object-contain"
            sizes="192px"
          />
        </div>

        <div className="relative mx-auto mt-5 grid size-14 place-items-center rounded-full border border-[#1687ff]/25 bg-[#1687ff]/10 text-[#1687ff]">
          <span className="absolute inset-1 animate-ping rounded-full bg-[#1687ff]/10" />
          <LoaderCircle className="relative size-7 animate-spin" aria-hidden="true" />
        </div>

        <h2
          id="meta-sync-title"
          className="mt-6 font-display text-2xl font-semibold text-foreground"
        >
          Sincronizando dados com a Meta
        </h2>
        <p
          id="meta-sync-description"
          className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground"
        >
          Estamos atualizando campanhas, conjuntos, anúncios e métricas. Isso
          pode levar alguns minutos.
        </p>

        <div className="mx-auto mt-7 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
          <span className="block h-full w-2/5 animate-[meta-sync-progress_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-[#0866ff] to-[#25a4ff]" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Mantenha esta página aberta até a conclusão.
        </p>

        <style jsx global>{`
          @keyframes meta-sync-progress {
            0% {
              transform: translateX(-120%);
            }
            100% {
              transform: translateX(350%);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
