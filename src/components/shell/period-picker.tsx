"use client";

import { useRef, useState } from "react";
import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { CalendarRange, ChevronDown, LoaderCircle } from "lucide-react";
import { periods, type PeriodFilterValue } from "@/components/dashboard/period-filter";
import { usePeriodScope } from "@/components/shell/period-scope";
import { useDismiss } from "@/components/shell/use-dismiss";
import { getDateRangeForPeriod } from "@/lib/dashboard-metrics";
import { cn } from "@/lib/utils";

type PeriodPickerProps = {
  // Limite de histórico do cliente (admin não tem limite).
  maxRangeDays?: number;
  maxRangeLabel?: string;
};

function describeRange(
  period: PeriodFilterValue,
  range: { start: string; end: string },
) {
  const resolved = getDateRangeForPeriod(period, range);
  const days = differenceInCalendarDays(resolved.end, resolved.start) + 1;

  return `${format(resolved.start, "dd/MM")} a ${format(resolved.end, "dd/MM/yyyy")} · ${days} ${days === 1 ? "dia" : "dias"}`;
}

export function PeriodPicker({ maxRangeDays, maxRangeLabel }: PeriodPickerProps) {
  const scope = usePeriodScope();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(scope.customRange);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismiss(containerRef, isOpen, () => setIsOpen(false));

  const exceedsLimit =
    !!maxRangeDays &&
    differenceInCalendarDays(parseISO(draft.end), parseISO(draft.start)) + 1 >
      maxRangeDays;

  function handlePreset(period: PeriodFilterValue) {
    if (period === "Personalizado") {
      scope.setPeriod(period, draft);
      return;
    }

    scope.setPeriod(period);
    setIsOpen(false);
  }

  function handleApply() {
    const range =
      exceedsLimit && maxRangeDays
        ? {
            start: format(
              subDays(parseISO(draft.end), maxRangeDays - 1),
              "yyyy-MM-dd",
            ),
            end: draft.end,
          }
        : draft;

    setDraft(range);
    scope.setPeriod("Personalizado", range);
    setIsOpen(false);
  }

  const label =
    scope.period === "Personalizado"
      ? describeRange(scope.period, scope.customRange)
      : scope.period;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="inline-flex h-9 max-w-[16rem] items-center gap-2 rounded-lg border border-border bg-background px-3 text-[0.8rem] text-foreground transition hover:border-primary/40"
      >
        {scope.isApplying ? (
          <LoaderCircle className="size-[0.95rem] shrink-0 animate-spin text-primary" />
        ) : (
          <CalendarRange
            className="size-[0.95rem] shrink-0 text-primary"
            strokeWidth={1.75}
          />
        )}
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Selecionar período"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-40 grid w-[min(32rem,calc(100vw-2rem))] grid-cols-1 overflow-hidden rounded-2xl border border-border/70 bg-popover shadow-2xl dark:border-white/10 sm:grid-cols-[11rem_minmax(0,1fr)]"
        >
          <div className="flex flex-col gap-1 border-b border-border/70 bg-muted/40 p-2 dark:border-white/10 dark:bg-white/[0.03] sm:border-b-0 sm:border-r">
            {periods.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePreset(preset)}
                className={cn(
                  "rounded-lg px-3 py-2 text-left text-[0.8rem] transition",
                  scope.period === preset
                    ? "bg-primary/[0.14] font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.06]",
                )}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-col gap-4 p-4">
            <div>
              <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Intervalo
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="min-w-0 space-y-1">
                  <span className="text-xs text-muted-foreground">De</span>
                  <input
                    type="date"
                    value={draft.start}
                    max={draft.end}
                    onChange={(event) =>
                      setDraft((range) => ({ ...range, start: event.target.value }))
                    }
                    className="h-10 w-full min-w-0 rounded-lg border border-border/70 bg-background/60 px-2 text-sm text-foreground outline-none focus:border-primary dark:border-white/10 dark:bg-black/30"
                  />
                </label>
                <label className="min-w-0 space-y-1">
                  <span className="text-xs text-muted-foreground">Até</span>
                  <input
                    type="date"
                    value={draft.end}
                    min={draft.start}
                    onChange={(event) =>
                      setDraft((range) => ({ ...range, end: event.target.value }))
                    }
                    className="h-10 w-full min-w-0 rounded-lg border border-border/70 bg-background/60 px-2 text-sm text-foreground outline-none focus:border-primary dark:border-white/10 dark:bg-black/30"
                  />
                </label>
              </div>
              <p className="mt-2 text-[0.7rem] leading-5 text-muted-foreground">
                {exceedsLimit
                  ? `Máximo de ${maxRangeLabel ?? `${maxRangeDays} dias`}. Ao aplicar, o intervalo é ajustado.`
                  : describeRange("Personalizado", draft)}
              </p>
            </div>

            <div>
              <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Comparar com
              </p>
              <div className="flex flex-col gap-1.5">
                {[
                  {
                    label: "Período anterior",
                    detail: "Mesma quantidade de dias",
                    value: true,
                  },
                  {
                    label: "Não comparar",
                    detail: "Mostrar só o período atual",
                    value: false,
                  },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => scope.setComparePrevious(option.value)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition",
                      scope.comparePrevious === option.value
                        ? "border-primary/40 bg-primary/[0.1]"
                        : "border-border/70 hover:bg-muted/60 dark:border-white/10 dark:hover:bg-white/[0.05]",
                    )}
                  >
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full border",
                        scope.comparePrevious === option.value
                          ? "border-primary bg-primary"
                          : "border-border dark:border-white/25",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.8rem] text-foreground">
                        {option.label}
                      </span>
                      <span className="block text-[0.7rem] text-muted-foreground">
                        {option.detail}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 border-t border-border/70 pt-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-10 flex-1 rounded-lg border border-border/70 text-sm text-muted-foreground transition hover:text-foreground dark:border-white/10"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="h-10 flex-1 rounded-lg bg-primary text-sm font-medium text-white transition hover:bg-primary/90"
              >
                Aplicar intervalo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
