import type { ReactNode } from "react";

function PulseBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[1.5rem] border border-border/60 bg-muted/60 dark:bg-white/[0.06] ${className ?? ""}`}
    />
  );
}

// Bloco cinza simples (sem borda) para os esqueletos do shell.
function Bar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-muted/60 dark:bg-white/[0.06] ${className ?? ""}`}
    />
  );
}

// Esqueleto que replica o DashboardShell + a seção de conteúdo, com as MESMAS
// cores e layout do estado final. Assim o loading.tsx e o fallback do Suspense
// ficam visualmente idênticos — o usuário percebe um único carregamento, sem o
// "pulo" entre dois skeletons diferentes.
export function DashboardShellSkeleton({ children }: { children?: ReactNode }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-transparent text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1680px] min-w-0 flex-col gap-4 overflow-x-hidden px-3 py-3 lg:flex-row lg:gap-6 lg:px-6 lg:py-4">
        {/* Barra superior (mobile) */}
        <div className="lg:hidden">
          <div className="dashboard-glass flex items-center justify-between gap-3 rounded-[1.5rem] px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="size-10 animate-pulse rounded-2xl bg-muted/60 dark:bg-white/[0.06]" />
              <div className="space-y-1.5">
                <Bar className="h-3 w-28" />
                <Bar className="h-2.5 w-20" />
              </div>
            </div>
            <div className="size-11 animate-pulse rounded-full bg-muted/60 dark:bg-white/[0.06]" />
          </div>
        </div>

        {/* Sidebar (desktop) */}
        <aside className="dashboard-glass hidden w-full flex-col rounded-[1.75rem] p-5 lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-1rem)] lg:w-[286px]">
          <div className="flex items-center gap-3">
            <div className="size-11 animate-pulse rounded-2xl bg-muted/60 dark:bg-white/[0.06]" />
            <div className="space-y-2">
              <Bar className="h-3.5 w-32" />
              <Bar className="h-2.5 w-20" />
            </div>
          </div>
          <div className="mt-8 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-2xl bg-muted/50 dark:bg-white/[0.05]"
              />
            ))}
          </div>
        </aside>

        {/* Conteúdo */}
        <section className="min-w-0 flex-1 overflow-x-hidden px-1 py-3 lg:px-3 lg:py-8">
          <div className="flex flex-col gap-4 border-b border-border/70 pb-5 dark:border-white/10 lg:pb-7">
            <Bar className="h-3 w-40" />
            <div className="h-10 w-64 max-w-full animate-pulse rounded-2xl bg-muted/60 dark:bg-white/[0.06]" />
            <Bar className="h-3 w-full max-w-xl" />
          </div>
          <div className="mt-6 lg:mt-8">{children ?? <PageSectionSkeleton />}</div>
        </section>
      </div>
    </main>
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
