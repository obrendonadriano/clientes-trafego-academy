import { format, isValid, parseISO, startOfDay, subDays } from "date-fns";
import type { Role } from "@/lib/types";

// Limite de histórico para contas de cliente (regra de negócio: 3 meses).
// Contas admin não têm limite.
export const CLIENT_MAX_RANGE_DAYS = 92;

// Janela de métricas em dias ISO (yyyy-MM-dd), inclusiva nas duas pontas.
// Strings (e não Date) para gerar chaves de cache estáveis no unstable_cache.
export type MetricsWindow = {
  startDate: string;
  endDate: string;
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

  return { startDate: toIsoDay(start), endDate: toIsoDay(end) };
}

type RangeSearchParams = {
  start?: string | string[];
  end?: string | string[];
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Resolve a janela de métricas de uma página a partir da URL (?start=&end=).
// A janela é sempre a UNIÃO do range pedido com a janela padrão, para que os
// presets do PeriodFilter (que filtram no client) continuem corretos.
// O clamp por role é a validação de backend: cliente nunca recebe mais que
// CLIENT_MAX_RANGE_DAYS, mesmo manipulando a URL.
export function resolveMetricsWindow(
  role: Role,
  searchParams?: RangeSearchParams,
  now = new Date(),
): MetricsWindow {
  const defaults = getDefaultMetricsWindow(now);
  const requestedStart = parseIsoDay(firstValue(searchParams?.start));

  const start =
    requestedStart && requestedStart.getTime() < parseISO(defaults.startDate).getTime()
      ? toIsoDay(requestedStart)
      : defaults.startDate;

  return clampMetricsWindowForRole(role, { startDate: start, endDate: defaults.endDate }, now);
}
