"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import type { PeriodFilterValue } from "@/components/dashboard/period-filter";
import { getDefaultCustomRange } from "@/lib/dashboard-metrics";

// O período passou a viver na topbar e é compartilhado por todas as páginas
// via URL, para o estado sobreviver à navegação e ao compartilhamento do link.
export const PERIOD_PARAM = "periodo";
export const COMPARE_PARAM = "comparar";
export const CLIENT_PARAM = "cliente";

const PERIOD_BY_SLUG: Record<string, PeriodFilterValue> = {
  hoje: "Hoje",
  ontem: "Ontem",
  d7: "Últimos 7 dias",
  d30: "Últimos 30 dias",
  mes: "Este mês",
  "mes-passado": "Mês passado",
  custom: "Personalizado",
};

const SLUG_BY_PERIOD = Object.fromEntries(
  Object.entries(PERIOD_BY_SLUG).map(([slug, value]) => [value, slug]),
) as Record<PeriodFilterValue, string>;

export const PERIOD_SLUGS = Object.keys(PERIOD_BY_SLUG);

export const DEFAULT_PERIOD: PeriodFilterValue = "Últimos 30 dias";

export function periodToSlug(period: PeriodFilterValue) {
  return SLUG_BY_PERIOD[period];
}

export function slugToPeriod(slug: string | null | undefined): PeriodFilterValue {
  return (slug && PERIOD_BY_SLUG[slug]) || DEFAULT_PERIOD;
}

export type PeriodScope = {
  period: PeriodFilterValue;
  customRange: { start: string; end: string };
  comparePrevious: boolean;
  clientId: string | null;
  isApplying: boolean;
  setPeriod: (
    period: PeriodFilterValue,
    range?: { start: string; end: string },
  ) => void;
  setComparePrevious: (value: boolean) => void;
  setClientId: (clientId: string | null) => void;
};

// Lê e escreve o período/comparação/cliente na querystring. As páginas leem
// daqui em vez de manter estado local, para a topbar comandar todas elas.
export function usePeriodScope(): PeriodScope {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isApplying, startTransition] = useTransition();

  const period = slugToPeriod(searchParams.get(PERIOD_PARAM));
  const comparePrevious = searchParams.get(COMPARE_PARAM) !== "nenhum";
  const clientId = searchParams.get(CLIENT_PARAM);

  const customRange = useMemo(() => {
    const fallback = getDefaultCustomRange();
    return {
      start: searchParams.get("start") || fallback.start,
      end: searchParams.get("end") || fallback.end,
    };
  }, [searchParams]);

  const push = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const query = params.toString();

      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  const setPeriod = useCallback<PeriodScope["setPeriod"]>(
    (next, range) => {
      push((params) => {
        params.set(PERIOD_PARAM, periodToSlug(next));

        if (next === "Personalizado" && range) {
          // O range custom pode ultrapassar a janela padrão de 92 dias, então
          // vai para a URL e o servidor refaz a busca com o período completo.
          params.set("start", range.start);
          params.set("end", range.end);
          return;
        }

        params.delete("start");
        params.delete("end");
      });
    },
    [push],
  );

  const setComparePrevious = useCallback(
    (value: boolean) => {
      push((params) => {
        if (value) {
          params.delete(COMPARE_PARAM);
          return;
        }

        params.set(COMPARE_PARAM, "nenhum");
      });
    },
    [push],
  );

  const setClientId = useCallback(
    (nextClientId: string | null) => {
      push((params) => {
        if (nextClientId) {
          params.set(CLIENT_PARAM, nextClientId);
          return;
        }

        params.delete(CLIENT_PARAM);
      });
    },
    [push],
  );

  return {
    period,
    customRange,
    comparePrevious,
    clientId,
    isApplying,
    setPeriod,
    setComparePrevious,
    setClientId,
  };
}

// Mantém o escopo (cliente/período) ao navegar entre seções e sub-abas.
export function useScopedHref() {
  const searchParams = useSearchParams();

  return useCallback(
    (href: string) => {
      const kept = new URLSearchParams();

      for (const key of [CLIENT_PARAM, PERIOD_PARAM, COMPARE_PARAM, "start", "end"]) {
        const value = searchParams.get(key);
        if (value) {
          kept.set(key, value);
        }
      }

      const query = kept.toString();
      if (!query) {
        return href;
      }

      return href.includes("?") ? `${href}&${query}` : `${href}?${query}`;
    },
    [searchParams],
  );
}
