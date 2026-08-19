import {
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { clampMetricsWindowForRole, type MetricsWindow } from "@/lib/data/date-range";
import type { Role } from "@/lib/types";

// Atalhos de período do fechamento. O usuário também pode informar datas
// livres (?inicio=&fim=), que é o "filtrar os dias do fechamento".
export const CLOSING_PRESETS = [
  { key: "mes-atual", label: "Este mês" },
  { key: "mes-passado", label: "Mês passado" },
  { key: "ultimos-30", label: "Últimos 30 dias" },
  { key: "ultimos-7", label: "Últimos 7 dias" },
] as const;

export type ClosingPresetKey = (typeof CLOSING_PRESETS)[number]["key"];

export const DEFAULT_CLOSING_PRESET: ClosingPresetKey = "mes-atual";

function iso(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function getClosingPresetWindow(
  preset: ClosingPresetKey,
  now = new Date(),
): MetricsWindow {
  const today = startOfDay(now);

  switch (preset) {
    case "mes-passado": {
      const reference = subMonths(today, 1);
      return {
        startDate: iso(startOfMonth(reference)),
        endDate: iso(endOfMonth(reference)),
      };
    }
    case "ultimos-30":
      return { startDate: iso(subDays(today, 29)), endDate: iso(today) };
    case "ultimos-7":
      return { startDate: iso(subDays(today, 6)), endDate: iso(today) };
    default:
      return { startDate: iso(startOfMonth(today)), endDate: iso(today) };
  }
}

function parseDay(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? startOfDay(parsed) : null;
}

// Resolve a janela do fechamento a partir da URL. Datas livres vencem o
// preset; o clamp por papel é a trava de backend (cliente nunca passa de 92
// dias, mesmo editando a querystring).
export function resolveClosingWindow(
  role: Role,
  params: { inicio?: string | null; fim?: string | null; preset?: string | null },
  now = new Date(),
): MetricsWindow {
  const start = parseDay(params.inicio);
  const end = parseDay(params.fim);

  if (start && end) {
    const ordered =
      start.getTime() <= end.getTime()
        ? { startDate: iso(start), endDate: iso(end) }
        : { startDate: iso(end), endDate: iso(start) };

    return clampMetricsWindowForRole(role, ordered, now);
  }

  const preset = CLOSING_PRESETS.some((item) => item.key === params.preset)
    ? (params.preset as ClosingPresetKey)
    : DEFAULT_CLOSING_PRESET;

  return clampMetricsWindowForRole(role, getClosingPresetWindow(preset, now), now);
}
