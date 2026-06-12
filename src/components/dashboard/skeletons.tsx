function PulseBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[1.5rem] border border-border/60 bg-muted/60 dark:bg-white/[0.06] ${className ?? ""}`}
    />
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-10 w-24 animate-pulse rounded-full bg-muted/60 dark:bg-white/[0.06]"
        />
      ))}
    </div>
  );
}

export function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <PulseBlock key={index} className="h-36" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return <PulseBlock className="h-[320px]" />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <PulseBlock key={index} className="h-16 rounded-2xl" />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <PulseBlock key={index} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}

// Fallback padrão das seções de página: filtros + cards + gráfico + tabela.
export function PageSectionSkeleton() {
  return (
    <div className="space-y-6">
      <FilterBarSkeleton />
      <MetricCardsSkeleton />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <ChartSkeleton />
        <PulseBlock className="h-[320px]" />
      </div>
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div className="space-y-6">
      <PulseBlock className="h-72" />
      <ListSkeleton />
    </div>
  );
}
