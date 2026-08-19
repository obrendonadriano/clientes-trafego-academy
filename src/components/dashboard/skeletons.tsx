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

// Esqueleto do conteudo da pagina (o shell agora vive no layout e permanece
// na tela durante a navegacao). Espelha o PageHeader + a secao carregada, para
// o loading.tsx e o fallback do Suspense parecerem um unico carregamento.
export function PageShellSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Bar className="h-2.5 w-36" />
        <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-muted/60 dark:bg-white/[0.06]" />
        <Bar className="h-3 w-full max-w-xl" />
      </div>

      {children ?? <PageSectionSkeleton />}
    </div>
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
