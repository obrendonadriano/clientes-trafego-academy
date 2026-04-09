"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO, subDays } from "date-fns";
import { CalendarRange, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export const periods = [
  "Hoje",
  "Ontem",
  "Últimos 7 dias",
  "Últimos 30 dias",
  "Este mês",
  "Mês passado",
  "Personalizado",
 ] as const;

export type PeriodFilterValue = (typeof periods)[number];

type PeriodFilterProps = {
  active?: PeriodFilterValue;
  onChange?: (value: PeriodFilterValue) => void;
  comparePrevious?: boolean;
  onComparePreviousChange?: (value: boolean) => void;
  customRange?: {
    start: string;
    end: string;
  };
  onCustomRangeChange?: (range: { start: string; end: string }) => void;
  onApplyCustomRange?: () => void;
  maxCustomRangeDays?: number;
  customLimitLabel?: string;
};

export function PeriodFilter({
  active: controlledActive,
  onChange,
  comparePrevious = false,
  onComparePreviousChange,
  customRange,
  onCustomRangeChange,
  onApplyCustomRange,
  maxCustomRangeDays,
  customLimitLabel,
}: PeriodFilterProps) {
  const [internalActive, setInternalActive] =
    useState<PeriodFilterValue>("Últimos 30 dias");
  const [customStart, setCustomStart] = useState("2026-04-01");
  const [customEnd, setCustomEnd] = useState("2026-04-08");
  const active = controlledActive ?? internalActive;
  const start = customRange?.start ?? customStart;
  const end = customRange?.end ?? customEnd;
  const customRangeExceedsLimit = useMemo(() => {
    if (!maxCustomRangeDays || !start || !end) {
      return false;
    }

    return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1 > maxCustomRangeDays;
  }, [end, maxCustomRangeDays, start]);

  function handleChange(value: PeriodFilterValue) {
    if (onChange) {
      onChange(value);
      return;
    }

    setInternalActive(value);
  }

  function handleRangeChange(next: { start: string; end: string }) {
    if (onCustomRangeChange) {
      onCustomRangeChange(next);
      return;
    }

    setCustomStart(next.start);
    setCustomEnd(next.end);
  }

  function handleApplyCustomRange() {
    if (!onApplyCustomRange) {
      return;
    }

    if (!maxCustomRangeDays || !customRangeExceedsLimit) {
      onApplyCustomRange();
      return;
    }

    const adjustedStart = subDays(parseISO(end), maxCustomRangeDays - 1);
    const adjustedRange = {
      start: adjustedStart.toISOString().slice(0, 10),
      end,
    };

    handleRangeChange(adjustedRange);
    onApplyCustomRange();
  }

  return (
    <div className="rounded-[1.75rem] border border-border/60 bg-background/70 p-3 shadow-[0_18px_40px_-28px_rgba(8,18,29,0.25)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3 px-2">
          <div className="rounded-2xl bg-primary/12 p-2 text-primary">
            <CalendarRange className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Período analisado</p>
            <p className="text-xs text-muted-foreground">
              Selecione rapidamente a janela de comparação
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {periods.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => handleChange(period)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition active:scale-[0.985]",
                active === period
                  ? "border-primary bg-primary text-primary-foreground shadow-[0_12px_24px_-16px_rgba(15,154,122,0.8)]"
                  : "border-border/70 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              {period}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onComparePreviousChange?.(!comparePrevious)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition active:scale-[0.985]",
            comparePrevious
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-border/70 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="size-4" />
          Comparar com anterior
        </button>
      </div>

      {active === "Personalizado" ? (
        <div className="mt-4 grid gap-3 rounded-[1.4rem] border border-border/60 bg-card/80 p-4 md:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Data inicial</span>
            <input
              type="date"
              value={start}
              max={end}
              onChange={(event) =>
                handleRangeChange({ start: event.target.value, end })
              }
              className="flex h-12 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Data final</span>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(event) =>
                handleRangeChange({ start, end: event.target.value })
              }
              className="flex h-12 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleApplyCustomRange}
              className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition active:scale-[0.985] hover:bg-primary hover:text-primary-foreground"
            >
              Aplicar período
            </button>
          </div>
          {maxCustomRangeDays ? (
            <div className="md:col-span-3">
              <p className="text-xs text-muted-foreground">
                {customRangeExceedsLimit
                  ? `No painel do cliente, o intervalo máximo é de ${customLimitLabel ?? `${maxCustomRangeDays} dias`}. Ao aplicar, o sistema ajusta automaticamente para esse limite.`
                  : `Intervalo personalizado disponível até ${customLimitLabel ?? `${maxCustomRangeDays} dias`}.`}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
