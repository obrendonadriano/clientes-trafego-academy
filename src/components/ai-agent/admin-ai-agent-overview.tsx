"use client";

import Link from "next/link";
import { Bot, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CLIENT_PLAN_LABELS,
  formatBrazilianWhatsapp,
  type ClientPlanType,
} from "@/lib/ai-agent/shared";

export type AdminAiAgentRow = {
  clientId: string;
  companyName: string;
  planType: ClientPlanType;
  aiEnabled: boolean;
  notificationWhatsapp: string | null;
  whatsappStatus: string | null;
  whatsappPhone: string | null;
  totalConversations: number;
  qualifiedConversations: number;
};

function WhatsappCell({ status }: { status: string | null }) {
  const connected = status === "WORKING";

  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true">{connected ? "🟢" : "🔴"}</span>
      {connected ? "Conectado" : "Desconectado"}
    </span>
  );
}

export function AdminAiAgentOverview({ rows }: { rows: AdminAiAgentRow[] }) {
  const complete = rows.filter((row) => row.planType === "complete");
  const active = rows.filter((row) => row.aiEnabled);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Clientes" value={rows.length} />
        <SummaryTile label="No Plano Completo" value={complete.length} />
        <SummaryTile label="Com IA ativa" value={active.length} />
      </div>

      <Card className="min-w-0">
        <CardHeader className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/12 p-3 text-primary">
            <Bot className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <CardTitle className="font-display text-xl">
              Atendimento IA por cliente
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Plano, conexão do WhatsApp e volume de leads atendidos pela IA.
            </p>
          </div>
        </CardHeader>

        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum cliente cadastrado ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-separate border-spacing-y-1.5 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 pb-1 font-medium">Cliente</th>
                    <th className="px-3 pb-1 font-medium">Plano</th>
                    <th className="px-3 pb-1 font-medium">IA</th>
                    <th className="px-3 pb-1 font-medium">WhatsApp</th>
                    <th className="px-3 pb-1 font-medium">Notificação</th>
                    <th className="px-3 pb-1 font-medium">Atendidos</th>
                    <th className="px-3 pb-1 font-medium">Qualificados</th>
                    <th className="px-3 pb-1 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.clientId}
                      className="bg-background/60 [&>td]:border-y [&>td]:border-border/60 [&>td]:px-3 [&>td]:py-3 [&>td:first-child]:rounded-l-2xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-2xl [&>td:last-child]:border-r"
                    >
                      <td className="font-medium text-foreground">
                        {row.companyName}
                      </td>
                      <td>
                        <Badge
                          variant={
                            row.planType === "complete" ? "default" : "secondary"
                          }
                        >
                          {CLIENT_PLAN_LABELS[row.planType]}
                        </Badge>
                      </td>
                      <td>
                        <Badge variant={row.aiEnabled ? "success" : "outline"}>
                          {row.aiEnabled ? "Ativada" : "Desativada"}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground">
                        <WhatsappCell status={row.whatsappStatus} />
                      </td>
                      <td className="text-muted-foreground">
                        {row.notificationWhatsapp
                          ? formatBrazilianWhatsapp(row.notificationWhatsapp)
                          : "Não configurado"}
                      </td>
                      <td>{row.totalConversations}</td>
                      <td>{row.qualifiedConversations}</td>
                      <td>
                        <Link
                          href={`/admin/clientes/${row.clientId}`}
                          className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
                        >
                          Editar plano
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="dashboard-card rounded-[1.5rem] border px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl text-foreground">{value}</p>
    </div>
  );
}
