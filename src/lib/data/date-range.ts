import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import type { Role } from "@/lib/types";

// Limite de histórico para contas de cliente (regra de negócio: 3 meses).
// Contas admin não têm limite.
export const CLIENT_MAX_RANGE_DAYS = 92;

// Janela de métricas em dias ISO (yyyy-MM-dd), inclusiva nas duas pontas.
// Strings (e não Date) para gerar chaves de cache estáveis no unstable_cache.
export type MetricsWindow = {
  startDate: string;
  endDate: string;
  includeHourly?: boolean;
};

function toIsoDay(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function parseIsoDay(value: string | undefined | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? startOfDay(parsed) : null;
}

// Janela padrão carregada pelas páginas: cobre todos os presets do
// PeriodFilter ("Mês passado" alcança no máximo ~62 dias atrás).
export function getDefaultMetricsWindow(now = new Date()): MetricsWindow {
  const end = startOfDay(now);
  return {
    startDate: toIsoDay(subDays(end, CLIENT_MAX_RANGE_DAYS - 1)),
    endDate: toIsoDay(end),
  };
}

export function clampMetricsWindowForRole(
  role: Role,
  window: MetricsWindow,
  now = new Date(),
): MetricsWindow {
  const today = startOfDay(now);

  let end = parseIsoDay(window.endDate) ?? today;
  if (end.getTime() > today.getTime()) {
    end = today;
  }

  let start = parseIsoDay(window.startDate) ?? subDays(end, CLIENT_MAX_RANGE_DAYS - 1);
  if (start.getTime() > end.getTime()) {
    start = subDays(end, CLIENT_MAX_RANGE_DAYS - 1);
  }

  if (role === "client") {
    const minStart = subDays(end, CLIENT_MAX_RANGE_DAYS - 1);
    if (start.getTime() < minStart.getTime()) {
      start = minStart;
    }
  }

  return {
    startDate: toIsoDay(start),
    endDate: toIsoDay(end),
    includeHourly: window.includeHourly,
  };
}

type RangeSearchParams = {
  start?: string | string[];
  end?: string | string[];
  periodo?: string | string[];
  comparar?: string | string[];
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveCurrentPeriod(
  params: RangeSearchParams | undefined,
  now: Date,
): MetricsWindow {
  const today = startOfDay(now);
  const slug = firstValue(params?.periodo) ?? "d30";

  if (slug === "hoje") {
    const day = toIsoDay(today);
    return { startDate: day, endDate: day, includeHourly: true };
  }

  if (slug === "ontem") {
    const day = toIsoDay(subDays(today, 1));
    return { startDate: day, endDate: day, includeHourly: true };
  }

  if (slug === "d7") {
    return { startDate: toIsoDay(subDays(today, 6)), endDate: toIsoDay(today) };
  }

  if (slug === "mes") {
    return { startDate: toIsoDay(startOfMonth(today)), endDate: toIsoDay(today) };
  }

  if (slug === "mes-passado") {
    const previousMonth = subMonths(today, 1);
    return {
      startDate: toIsoDay(startOfMonth(previousMonth)),
      endDate: toIsoDay(endOfMonth(previousMonth)),
    };
  }

  if (slug === "custom") {
    const requestedStart = parseIsoDay(firstValue(params?.start));
    const requestedEnd = parseIsoDay(firstValue(params?.end));

    if (requestedStart && requestedEnd && requestedStart <= requestedEnd) {
      return {
        startDate: toIsoDay(requestedStart),
        endDate: toIsoDay(requestedEnd),
        includeHourly:
          differenceInCalendarDays(requestedEnd, requestedStart) === 0,
      };
    }
  }

  return {
    startDate: toIsoDay(subDays(today, 29)),
    endDate: toIsoDay(today),
  };
}

// Resolve somente o período que a tela realmente usa. Quando a comparação
// está ativa, inclui também o intervalo anterior de mesmo tamanho; não baixa
// mais 92 dias e linhas horárias para todo preset.
export function resolveMetricsWindow(
  role: Role,
  searchParams?: RangeSearchParams,
  now = new Date(),
): MetricsWindow {
  const current = resolveCurrentPeriod(searchParams, now);
  const comparePrevious = firstValue(searchParams?.comparar) !== "nenhum";

  if (!comparePrevious) {
    return clampMetricsWindowForRole(role, current, now);
  }

  const start = parseISO(current.startDate);
  const end = parseISO(current.endDate);
  const days = differenceInCalendarDays(end, start) + 1;

  return {
    ...clampMetricsWindowForRole(
      role,
      {
        startDate: toIsoDay(subDays(start, days)),
        endDate: current.endDate,
      },
      now,
    ),
    includeHourly: current.includeHourly,
  };
}
