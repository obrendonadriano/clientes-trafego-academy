import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { CountUp } from "@/components/dashboard/count-up";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  // Marcador opcional ao lado do rótulo (ex.: o "(?)" dos impostos).
  info?: ReactNode;
  icon?: LucideIcon;
  value: string;
  // Variação ("+12,5%") ou uma nota curta ("período atual").
  change: string;
  positive?: boolean;
  // Valor secundário (ex.: "US$ 39,14") exibido ao lado da variação.
  sub?: string;
  className?: string;
};

// Só variações percentuais ("+12,5%") viram pílula; o resto é nota em cinza.
const DELTA_PATTERN = /^[+-]?\d[\d.,]*%$/;

export function MetricCard({
  label,
  info,
  icon: Icon,
  value,
  change,
  positive = true,
  sub,
  className,
}: MetricCardProps) {
  const isDelta = DELTA_PATTERN.test(change.trim());
  const isFlat = isDelta && Number(change.replace(/[^\d,-]/g, "").replace(",", ".")) === 0;
  // A seta segue o sinal da variação; a cor diz se isso é bom ou ruim
  // (custo subindo é seta para cima em vermelho).
  const goesDown = change.trim().startsWith("-");

  return (
    <div
      className={cn(
        "card-lift flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 sm:p-[18px] text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          <span className="truncate">{label}</span>
          {info}
        </p>
        {Icon ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-text-3">
            <Icon className="size-[15px]" strokeWidth={1.75} />
          </span>
        ) : null}
      </div>

      <p className="whitespace-nowrap text-[22px] font-semibold sm:text-[28px] leading-none tracking-[-0.035em] tabular-nums">
        <CountUp value={value} />
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {isDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-[7px] py-0.5 font-semibold",
              isFlat
                ? "bg-secondary text-text-3"
                : positive
                  ? "bg-[#ecfdf3] text-[#067647]"
                  : "bg-[#fef3f2] text-[#b42318]",
            )}
          >
            {isFlat ? null : !goesDown ? (
              <ArrowUpRight className="size-3" strokeWidth={2.25} />
            ) : (
              <ArrowDownRight className="size-3" strokeWidth={2.25} />
            )}
            {change}
          </span>
        ) : (
          <span className="text-text-4">{change}</span>
        )}
        {isDelta ? <span className="text-text-4">vs. período anterior</span> : null}
        {sub ? <span className="ml-auto text-muted-foreground">{sub}</span> : null}
      </div>
    </div>
  );
}
