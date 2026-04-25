import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  change: string;
  positive?: boolean;
};

export function MetricCard({
  label,
  value,
  change,
  positive = true,
}: MetricCardProps) {
  return (
    <div className="dashboard-card relative min-h-[242px] rounded-[1.5rem] border p-5 text-foreground">
      <div className="absolute inset-x-5 top-0 h-1 rounded-b-full bg-[linear-gradient(90deg,rgba(62,214,184,0.18),rgba(122,142,255,0.95),rgba(139,120,255,0.22))]" />
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-muted-foreground">{label}</p>
        </div>
        <div
          className={cn(
            "inline-flex max-w-[56%] shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold leading-5 sm:text-sm",
            positive
              ? "bg-primary/[0.18] text-primary dark:text-[#a99cff]"
              : "bg-destructive/[0.18] text-destructive",
          )}
        >
          {positive ? (
            <ArrowUpRight className="size-4 shrink-0" />
          ) : (
            <ArrowDownRight className="size-4 shrink-0" />
          )}
          <span className="min-w-0 break-words">{change}</span>
        </div>
      </div>
      <p className="mt-5 whitespace-nowrap font-display text-[clamp(2.25rem,2.7vw,2.75rem)] font-semibold leading-none text-foreground">
        {value}
      </p>
      <div className="mt-7 h-px bg-border/70 dark:bg-white/10" />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Indicador
        </p>
        <p className="text-xs text-muted-foreground">Atualizado agora</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Leitura executiva da operação atual.
        </p>
        <p className="sr-only font-display text-3xl font-semibold">
          {value}
        </p>
      </div>
    </div>
  );
}
