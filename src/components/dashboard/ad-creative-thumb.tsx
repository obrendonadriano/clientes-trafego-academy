"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

type AdCreativeThumbProps = {
  name: string;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  adUrl?: string | null;
  className?: string;
};

const PREVIEW_WIDTH = 260;
const CLOSE_DELAY_MS = 120;

// Miniatura do criativo. Ao passar o mouse abre uma prévia maior com o link
// para o anúncio no Facebook; clicar na miniatura abre o anúncio direto.
// A prévia usa posição fixa para não ser cortada pela rolagem da tabela.
export function AdCreativeThumb({
  name,
  thumbnailUrl,
  imageUrl,
  adUrl,
  className,
}: AdCreativeThumbProps) {
  const anchorRef = useRef<HTMLAnchorElement | HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const hasImage = Boolean(thumbnailUrl) && !broken;

  function open() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect || !hasImage) return;

    const fitsRight = rect.right + 12 + PREVIEW_WIDTH < window.innerWidth;
    setPosition({
      left: fitsRight ? rect.right + 12 : Math.max(8, rect.left - 12 - PREVIEW_WIDTH),
      top: Math.min(Math.max(8, rect.top - 40), window.innerHeight - 360),
    });
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setPosition(null), CLOSE_DELAY_MS);
  }

  const thumb = hasImage ? (
    // URLs assinadas da Meta (fbcdn) mudam a cada leitura: sem otimização do next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnailUrl ?? undefined}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="size-full object-cover"
    />
  ) : (
    <ImageOff className="size-4 text-text-4" strokeWidth={1.75} />
  );

  const thumbClass = cn(
    "grid size-11 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-border bg-surface-2 transition",
    adUrl && "hover:border-brand-300 hover:shadow-[0_0_0_3px_var(--ring)]",
    className,
  );

  return (
    <>
      {adUrl ? (
        <a
          ref={anchorRef as React.RefObject<HTMLAnchorElement>}
          href={adUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir o anúncio ${name} no Facebook`}
          onMouseEnter={open}
          onMouseLeave={scheduleClose}
          onFocus={open}
          onBlur={scheduleClose}
          className={thumbClass}
        >
          {thumb}
        </a>
      ) : (
        <span
          ref={anchorRef as React.RefObject<HTMLSpanElement>}
          onMouseEnter={open}
          onMouseLeave={scheduleClose}
          className={thumbClass}
        >
          {thumb}
        </span>
      )}

      {position ? (
        <div
          role="tooltip"
          onMouseEnter={open}
          onMouseLeave={scheduleClose}
          style={{ left: position.left, top: position.top, width: PREVIEW_WIDTH }}
          className="animate-ta-in fixed z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_48px_-12px_rgba(16,24,40,0.28)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl ?? thumbnailUrl ?? undefined}
            alt={`Criativo do anúncio ${name}`}
            className="max-h-[260px] w-full bg-surface-2 object-contain"
          />
          <div className="flex flex-col gap-2 p-3">
            <p className="line-clamp-2 text-[13px] font-medium text-foreground">{name}</p>
            {adUrl ? (
              <a
                href={adUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[linear-gradient(180deg,var(--brand-500),var(--brand-600))] text-[13px] font-semibold text-white transition hover:brightness-[1.07]"
              >
                Abrir anúncio no Facebook
                <ExternalLink className="size-3.5" strokeWidth={2} />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
