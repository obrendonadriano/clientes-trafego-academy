"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  Bot,
  CircleUser,
  LoaderCircle,
  MessagesSquare,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  loadConversationMessagesAction,
  setHumanTakeoverAction,
  type AiAgentActionState,
} from "@/app/dashboard/atendimento-ia/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  AI_LEAD_STATUS_LABELS,
  formatBrazilianWhatsapp,
  type AiConversationMessage,
  type AiConversationSummary,
  type AiLeadStatus,
} from "@/lib/ai-agent/shared";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<
  AiLeadStatus,
  "default" | "secondary" | "outline" | "success"
> = {
  new: "outline",
  qualifying: "secondary",
  qualified: "success",
  disqualified: "outline",
  human_takeover: "default",
  completed: "success",
  error: "outline",
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Não informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function orNotInformed(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Não informado";
  }

  return String(value);
}

const FILTERS: { key: AiLeadStatus | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "qualified", label: "Qualificados" },
  { key: "qualifying", label: "Em qualificação" },
  { key: "disqualified", label: "Desqualificados" },
  { key: "human_takeover", label: "Atendimento humano" },
];

export function AiLeadsPanel({
  conversations,
  interactive,
}: {
  conversations: AiConversationSummary[];
  // Falso no Plano Essencial: a lista aparece, mas nada abre.
  interactive: boolean;
}) {
  const [filter, setFilter] = useState<AiLeadStatus | "todos">("todos");
  const [selected, setSelected] = useState<AiConversationSummary | null>(null);

  const visible = conversations.filter(
    (item) => filter === "todos" || item.status === filter,
  );

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="font-display text-xl">Leads da IA</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Quem conversou com o atendimento automático e o que a IA já coletou.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                filter === item.key
                  ? "border-primary/30 bg-primary/12 text-primary"
                  : "border-border/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum lead por aqui ainda. Assim que alguém chamar no WhatsApp, a
            conversa aparece nesta lista.
          </p>
        ) : (
          <>
            {/* Celular: cartões. Desktop: tabela. */}
            <ul className="space-y-2 lg:hidden">
              {visible.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!interactive}
                    onClick={() => setSelected(item)}
                    className="w-full rounded-2xl border border-border/60 bg-background/60 p-4 text-left transition enabled:hover:border-primary/30 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {item.name || "Sem nome"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatBrazilianWhatsapp(item.whatsappNumber)}
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        {AI_LEAD_STATUS_LABELS[item.status]}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {orNotInformed(item.vehicle)}
                      {item.vehicleYear ? ` · ${item.vehicleYear}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[60rem] border-separate border-spacing-y-1.5 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 pb-1 font-medium">Nome</th>
                    <th className="px-3 pb-1 font-medium">Telefone</th>
                    <th className="px-3 pb-1 font-medium">Veículo</th>
                    <th className="px-3 pb-1 font-medium">Ano</th>
                    <th className="px-3 pb-1 font-medium">Banco</th>
                    <th className="px-3 pb-1 font-medium">Dívida</th>
                    <th className="px-3 pb-1 font-medium">Atrasadas</th>
                    <th className="px-3 pb-1 font-medium">Data</th>
                    <th className="px-3 pb-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr
                      key={item.id}
                      tabIndex={interactive ? 0 : -1}
                      onClick={() => interactive && setSelected(item)}
                      onKeyDown={(event) => {
                        if (interactive && event.key === "Enter") {
                          setSelected(item);
                        }
                      }}
                      className={cn(
                        "bg-background/60 [&>td]:border-y [&>td]:border-border/60 [&>td]:px-3 [&>td]:py-3",
                        "[&>td:first-child]:rounded-l-2xl [&>td:first-child]:border-l",
                        "[&>td:last-child]:rounded-r-2xl [&>td:last-child]:border-r",
                        interactive &&
                          "cursor-pointer transition hover:bg-accent/60",
                      )}
                    >
                      <td className="font-medium text-foreground">
                        {item.name || "Sem nome"}
                      </td>
                      <td className="text-muted-foreground">
                        {formatBrazilianWhatsapp(item.whatsappNumber)}
                      </td>
                      <td>{orNotInformed(item.vehicle)}</td>
                      <td>{orNotInformed(item.vehicleYear)}</td>
                      <td>{orNotInformed(item.bank)}</td>
                      <td>{formatCurrency(item.debtAmount)}</td>
                      <td>
                        {item.hasOverdueInstallments === null
                          ? "Não informado"
                          : item.hasOverdueInstallments
                            ? `Sim${
                                item.overdueInstallmentsCount
                                  ? ` (${item.overdueInstallmentsCount})`
                                  : ""
                              }`
                            : "Não"}
                      </td>
                      <td className="text-muted-foreground">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td>
                        <Badge variant={STATUS_VARIANT[item.status]}>
                          {AI_LEAD_STATUS_LABELS[item.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>

      {selected ? (
        <ConversationDialog
          conversation={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </Card>
  );
}

const initialState: AiAgentActionState = {};

function ConversationDialog({
  conversation,
  onClose,
}: {
  conversation: AiConversationSummary;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<AiConversationMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [takeoverState, takeoverAction] = useActionState(
    setHumanTakeoverAction,
    initialState,
  );

  useEffect(() => {
    startLoading(async () => {
      const result = await loadConversationMessagesAction(conversation.id);

      if (result.error) {
        setLoadError(result.error);
        return;
      }

      setMessages(result.messages ?? []);
    });
  }, [conversation.id]);

  useEffect(() => {
    if (takeoverState.success) {
      showToast({ message: takeoverState.success });
      onClose();
    } else if (takeoverState.error) {
      showToast({ message: takeoverState.error, tone: "erro" });
    }
  }, [onClose, showToast, takeoverState]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa com ${conversation.name || "lead"}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.5rem] border border-border/60 bg-card shadow-2xl sm:rounded-[1.5rem]">
        <header className="flex items-start justify-between gap-3 border-b border-border/60 p-5">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-medium text-foreground">
              {conversation.name || "Lead sem nome"}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatBrazilianWhatsapp(conversation.whatsappNumber)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[conversation.status]}>
              {AI_LEAD_STATUS_LABELS[conversation.status]}
            </Badge>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-xl p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <DetailItem label="Veículo" value={orNotInformed(conversation.vehicle)} />
            <DetailItem label="Ano" value={orNotInformed(conversation.vehicleYear)} />
            <DetailItem
              label="Financiado"
              value={
                conversation.financed === null
                  ? "Não informado"
                  : conversation.financed
                    ? "Sim"
                    : "Não"
              }
            />
            <DetailItem label="Banco" value={orNotInformed(conversation.bank)} />
            <DetailItem
              label="Dívida aproximada"
              value={formatCurrency(conversation.debtAmount)}
            />
            <DetailItem
              label="Parcelas atrasadas"
              value={
                conversation.hasOverdueInstallments === null
                  ? "Não informado"
                  : conversation.hasOverdueInstallments
                    ? `Sim${
                        conversation.overdueInstallmentsCount
                          ? ` · ${conversation.overdueInstallmentsCount}`
                          : ""
                      }`
                    : "Não"
              }
            />
          </dl>

          {conversation.disqualificationReason ? (
            <p className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              Motivo da desqualificação:{" "}
              <strong className="text-foreground">
                {conversation.disqualificationReason}
              </strong>
            </p>
          ) : null}

          {conversation.unknownFields.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              O lead informou não saber: {conversation.unknownFields.join(", ")}.
            </p>
          ) : null}

          <section className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MessagesSquare className="size-4 text-muted-foreground" />
              Histórico da conversa
            </h4>

            {isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Carregando mensagens...
              </p>
            ) : loadError ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {loadError}
              </p>
            ) : messages && messages.length > 0 ? (
              <ol className="space-y-2">
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn(
                      "flex gap-2",
                      message.direction === "outbound"
                        ? "justify-end"
                        : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6",
                        message.direction === "outbound"
                          ? "bg-primary/12 text-foreground"
                          : "border border-border/60 bg-background/60 text-foreground",
                      )}
                    >
                      <span className="mb-1 flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
                        {message.direction === "outbound" ? (
                          <>
                            <Bot className="size-3" /> IA
                          </>
                        ) : (
                          <>
                            <CircleUser className="size-3" /> Lead
                          </>
                        )}
                        <span>· {formatDateTime(message.createdAt)}</span>
                      </span>
                      <p className="whitespace-pre-wrap">{message.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma mensagem registrada.
              </p>
            )}
          </section>
        </div>

        <footer className="border-t border-border/60 p-5">
          <form action={takeoverAction} className="flex flex-wrap gap-2">
            <input
              type="hidden"
              name="conversationId"
              value={conversation.id}
            />
            <input
              type="hidden"
              name="humanTakeover"
              value={conversation.humanTakeover ? "false" : "true"}
            />
            <Button type="submit" variant="outline" className="flex-1">
              <UserRoundCheck className="mr-2 size-4" />
              {conversation.humanTakeover
                ? "Retomar IA nesta conversa"
                : "Assumir atendimento (parar a IA)"}
            </Button>
          </form>

          {conversation.humanTakeoverRequested ? (
            <p className="mt-3 text-xs text-muted-foreground">
              O lead pediu para falar com uma pessoa.
            </p>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
