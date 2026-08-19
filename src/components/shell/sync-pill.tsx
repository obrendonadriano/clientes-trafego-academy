import { cn } from "@/lib/utils";
import type { SyncStatus } from "@/lib/types";

function formatClock(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

// Selo da topbar: mostra somente o estado da última atualização manual.
export function SyncPill({
  status,
  className,
}: {
  status?: SyncStatus | null;
  className?: string;
}) {
  if (!status) {
    return null;
  }

  const lastSuccess = formatClock(status.lastSuccessAt);

  const tone =
    status.status === "error"
      ? "bg-destructive"
      : status.status === "running"
        ? "bg-primary animate-pulse"
        : status.status === "success"
          ? "bg-emerald-500"
          : "bg-amber-500";

  const label =
    status.status === "error"
      ? "Falha na sincronização"
      : status.status === "running"
        ? "Sincronizando…"
        : lastSuccess
          ? `Atualizado ${lastSuccess}`
          : "Aguardando primeira sincronização";

  return (
    <span
      title={status.message ?? undefined}
      className={cn(
        "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-2.5 text-[0.72rem] text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-[0.42rem] shrink-0 rounded-full", tone)} />
      {label}
    </span>
  );
}
