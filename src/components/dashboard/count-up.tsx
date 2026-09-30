"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1000;

// Separa o primeiro número de um valor já formatado em pt-BR
// ("R$ 1.234", "3,45%", "2,31x") para animar só a parte numérica.
function parseFormatted(text: string) {
  const match = /\d[\d.]*(?:,\d+)?/.exec(text);
  if (!match) {
    return null;
  }

  const raw = match[0];
  const decimals = raw.includes(",") ? raw.split(",")[1].length : 0;
  const number = Number(raw.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(number)) {
    return null;
  }

  return {
    number,
    decimals,
    prefix: text.slice(0, match.index),
    suffix: text.slice(match.index + raw.length),
  };
}

function render(parsed: NonNullable<ReturnType<typeof parseFormatted>>, n: number) {
  return (
    parsed.prefix +
    n.toLocaleString("pt-BR", {
      minimumFractionDigits: parsed.decimals,
      maximumFractionDigits: parsed.decimals,
    }) +
    parsed.suffix
  );
}

// Número que "sobe" até o valor final (ease-out cúbico em 1s), como no design.
// Ao trocar o período, anima do valor exibido até o novo.
export function CountUp({ value }: { value: string }) {
  const parsed = parseFormatted(value);
  const target = parsed?.number ?? 0;
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    const from = displayRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let start = -1;
    let frame = 0;

    const step = (now: number) => {
      if (start < 0) start = now;
      const k = reduce ? 1 : Math.min(1, (now - start) / DURATION_MS);
      const next =
        k >= 1 ? target : from + (target - from) * (1 - Math.pow(1 - k, 3));
      displayRef.current = next;
      setDisplay(next);
      if (k < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (!parsed || display === target) {
    return <>{value}</>;
  }

  return (
    <>
      <span aria-hidden="true">{render(parsed, display)}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}
