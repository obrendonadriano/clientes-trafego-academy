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
    <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(245,246,255,0.98)_100%)] p-5 shadow-[0_24px_48px_-30px_rgba(29,31,67,0.18)] dark:bg-[linear-gradient(180deg,rgba(12,14,28,0.96)_0%,rgba(10,12,24,0.98)_100%)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(104,136,255,0.12),rgba(125,104,245,0.92),rgba(183,135,255,0.18))]" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-4 font-display text-4xl font-semibold tracking-[-0.05em] text-foreground">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
            positive
              ? "bg-primary/14 text-primary"
              : "bg-destructive/14 text-destructive",
          )}
        >
          {positive ? (
            <ArrowUpRight className="size-4" />
          ) : (
            <ArrowDownRight className="size-4" />
          )}
          {change}
        </div>
      </div>
      <div className="mt-6 h-px bg-border/60" />
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Indicador
        </p>
        <p className="text-xs text-muted-foreground">Atualizado agora</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Leitura executiva da operação atual.
        </p>
        <p className="font-display text-3xl font-semibold tracking-[-0.04em] sr-only">
          {value}
        </p>
      </div>
    </div>
  );
}
