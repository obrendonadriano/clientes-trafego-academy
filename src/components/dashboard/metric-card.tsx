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
    <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(246,249,245,0.92)_100%)] p-5 shadow-[0_24px_48px_-30px_rgba(8,18,29,0.35)] dark:bg-[linear-gradient(180deg,rgba(12,24,36,0.9)_0%,rgba(8,17,29,0.96)_100%)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(15,154,122,0.15),rgba(15,154,122,0.85),rgba(15,154,122,0.15))]" />
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
