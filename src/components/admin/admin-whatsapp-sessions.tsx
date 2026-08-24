import { formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock3, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatWhatsappPhone,
  type WhatsappSession,
  type WhatsappSessionStatus,
} from "@/lib/whatsapp-session";

type AdminWhatsappSessionsProps = {
  sessions: WhatsappSession[];
  clients: Array<{ id: string; name: string }>;
  notice?: string;
};

const PRIORITY: Record<WhatsappSessionStatus, number> = {
  FAILED: 0,
  STOPPED: 1,
  STARTING: 2,
  SCAN_QR_CODE: 3,
  NAO_CRIADA: 4,
  WORKING: 5,
};

const LABELS: Record<WhatsappSessionStatus, string> = {
  FAILED: "Falhou",
  STOPPED: "Desconectado",
  STARTING: "Iniciando",
  SCAN_QR_CODE: "Aguardando QR",
  NAO_CRIADA: "Não criada",
  WORKING: "Conectado",
};

function lastEvent(session: WhatsappSession) {
  const dates = [session.connectedAt, session.disconnectedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => parseISO(value))
    .filter((value) => isValid(value))
    .sort((a, b) => b.getTime() - a.getTime());

  if (!dates[0]) {
    return "Sem evento registrado";
  }

  return `há ${formatDistanceToNowStrict(dates[0], { locale: ptBR })}`;
}

function StatusBadge({ status }: { status: WhatsappSessionStatus }) {
  const problem = status === "FAILED" || status === "STOPPED";
  const working = status === "WORKING";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        problem && "border-red-500/35 bg-red-500/12 text-red-700 dark:text-red-200",
        working && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
        !problem && !working && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
      )}
    >
      <span className={cn("size-1.5 rounded-full", problem ? "bg-red-500" : working ? "bg-emerald-500" : "bg-amber-500")} />
      {LABELS[status]}
    </span>
  );
}

export function AdminWhatsappSessions({
  sessions,
  clients,
  notice,
}: AdminWhatsappSessionsProps) {
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  const sorted = [...sessions].sort((a, b) => {
    const byStatus = PRIORITY[a.status] - PRIORITY[b.status];
    if (byStatus !== 0) return byStatus;
    return (clientNames.get(a.clientId) ?? "").localeCompare(
      clientNames.get(b.clientId) ?? "",
      "pt-BR",
    );
  });
  const problems = sessions.filter(
    (session) => session.status === "FAILED" || session.status === "STOPPED",
  ).length;
  const working = sessions.filter((session) => session.status === "WORKING").length;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b border-border/60 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <div>
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <MessageCircle className="size-5 text-primary" aria-hidden="true" />
              Conexões de WhatsApp
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Problemas aparecem primeiro para facilitar o atendimento.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-red-700 dark:text-red-200">
              <AlertTriangle className="size-3.5" /> {problems} com problema
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-emerald-700 dark:text-emerald-200">
              <CheckCircle2 className="size-3.5" /> {working} conectados
            </span>
          </div>
        </div>

        {notice ? (
          <p className="m-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
            {notice}
          </p>
        ) : sorted.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center text-muted-foreground">
            <MessageCircle className="size-8 opacity-50" aria-hidden="true" />
            <p className="mt-3 font-medium text-foreground">Nenhuma sessão criada ainda</p>
            <p className="mt-1 text-sm">As conexões aparecerão aqui quando os clientes iniciarem o processo.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground dark:border-white/10">
                    <th className="px-5 py-3 font-medium">Cliente</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Número</th>
                    <th className="px-5 py-3 font-medium">Conectou em</th>
                    <th className="px-5 py-3 font-medium">Último evento</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((session) => (
                    <tr key={session.clientId} className="border-b border-border/40 last:border-0 dark:border-white/[0.06]">
                      <td className="px-5 py-4 font-medium text-foreground">{clientNames.get(session.clientId) ?? "Cliente não identificado"}</td>
                      <td className="px-5 py-4"><StatusBadge status={session.status} /></td>
                      <td className="px-5 py-4 text-muted-foreground">{formatWhatsappPhone(session.phoneNumber) ?? "—"}</td>
                      <td className="px-5 py-4 text-muted-foreground">{session.connectedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(parseISO(session.connectedAt)) : "—"}</td>
                      <td className="px-5 py-4 text-muted-foreground">{lastEvent(session)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border/60 lg:hidden dark:divide-white/10">
              {sorted.map((session) => (
                <div key={session.clientId} className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-foreground">{clientNames.get(session.clientId) ?? "Cliente não identificado"}</p>
                    <StatusBadge status={session.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                    <span>{formatWhatsappPhone(session.phoneNumber) ?? "Sem número"}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" /> {lastEvent(session)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
