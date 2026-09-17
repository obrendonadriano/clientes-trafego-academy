"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  BadgeDollarSign,
  LoaderCircle,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import {
  closeLeadAction,
  qualifyLeadsAction,
} from "@/app/conversoes/actions";
import {
  AlreadySentWarning,
  CapiErrorBadge,
  NoClickIdWarning,
  QualificationBadge,
} from "@/components/conversions/lead-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  maskPhone,
  PERIOD_OPTIONS,
  QUALIFICATION_TABS,
  type ConversionLead,
  type ConversionLeadsResult,
  type LeadQualification,
  type PeriodOption,
  type QualificationTab,
} from "@/lib/conversions/shared";
import { cn } from "@/lib/utils";

type ClientOption = { id: string; name: string };

type ConversionsPageProps = {
  data: ConversionLeadsResult;
  tab: QualificationTab;
  period: PeriodOption;
  isAdmin: boolean;
  clients: ClientOption[];
  selectedClientId: string | null;
};

function dateTime(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);

  // "24/08, 14:30" -> "24/08 às 14:30"
  return formatted.replace(", ", " às ");
}

function parseSaleValue(raw: string) {
  const compact = raw.trim().replace(/\s/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  return Number(normalized);
}

export function ConversionsPage({
  data,
  tab,
  period,
  isAdmin,
  clients,
  selectedClientId,
}: ConversionsPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [isNavigating, startNavigation] = useTransition();

  // Marcações aplicadas na hora, antes do servidor confirmar.
  const [overrides, setOverrides] = useState<Map<string, LeadQualification>>(
    new Map(),
  );
  // Linhas que já saíram da aba e estão só terminando a animação.
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [closingLead, setClosingLead] = useState<ConversionLead | null>(null);
  const [saleValue, setSaleValue] = useState("");

  const leads = useMemo(
    () =>
      data.leads.map((lead) => {
        const override = overrides.get(lead.id);
        return override ? { ...lead, qualification: override } : lead;
      }),
    [data.leads, overrides],
  );

  // Some da aba quem deixou de pertencer a ela (depois da animação).
  const visible = leads.filter(
    (lead) =>
      tab === "todos" || lead.qualification === tab || leaving.has(lead.id),
  );

  const updateParams = useCallback(
    (
      mutate: (params: URLSearchParams) => void,
      { resetPage = true }: { resetPage?: boolean } = {},
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      if (resetPage) {
        params.delete("pagina");
      }

      startNavigation(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Declaração de função (e não const) porque o "Desfazer" do toast chama a
  // própria rotina para devolver os leads ao estado anterior.
  async function applyQualification(
    ids: string[],
    qualification: LeadQualification,
    previous: Map<string, LeadQualification>,
  ) {
    setIsSaving(true);

    setOverrides((current) => {
      const next = new Map(current);
      ids.forEach((id) => next.set(id, qualification));
      return next;
    });

    // Só anima a saída quando o item realmente deixa a aba atual.
    if (tab !== "todos" && qualification !== tab) {
      setLeaving((current) => new Set([...current, ...ids]));
      window.setTimeout(() => {
        setLeaving((current) => {
          const next = new Set(current);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }, 320);
    }

    const result = await qualifyLeadsAction(ids, qualification);
    setIsSaving(false);

    if (result.error) {
      // Falhou: devolve as linhas ao estado anterior.
      setOverrides((current) => {
        const next = new Map(current);
        ids.forEach((id) => {
          const anterior = previous.get(id);
          if (anterior) {
            next.set(id, anterior);
          } else {
            next.delete(id);
          }
        });
        return next;
      });
      setLeaving(new Set());
      showToast({ message: result.error, tone: "erro", duration: 8000 });
      return;
    }

    setSelected(new Set());
    showToast({
      message: result.success ?? "Pronto.",
      action: {
        label: "Desfazer",
        onClick: () => {
          const restore = new Map<string, LeadQualification>();
          ids.forEach((id) => restore.set(id, qualification));
          // Volta cada lead exatamente para o que era antes.
          const grupos = new Map<LeadQualification, string[]>();
          ids.forEach((id) => {
            const anterior = previous.get(id) ?? "pendente";
            grupos.set(anterior, [...(grupos.get(anterior) ?? []), id]);
          });

          grupos.forEach((grupoIds, anterior) => {
            void applyQualification(grupoIds, anterior, restore);
          });
        },
      },
    });

    router.refresh();
  }

  const qualifyOne = (
    lead: ConversionLead,
    qualification: LeadQualification,
  ) => {
    const previous = new Map([[lead.id, lead.qualification]]);
    void applyQualification([lead.id], qualification, previous);
  };

  const qualifySelected = (qualification: LeadQualification) => {
    const ids = [...selected];

    if (ids.length === 0) {
      return;
    }

    const previous = new Map(
      leads
        .filter((lead) => selected.has(lead.id))
        .map((lead) => [lead.id, lead.qualification] as const),
    );
    void applyQualification(ids, qualification, previous);
  };

  const openCloseDialog = (lead: ConversionLead) => {
    setClosingLead(lead);
    setSaleValue(lead.value ? String(lead.value).replace(".", ",") : "");
  };

  const confirmClose = async () => {
    if (!closingLead) {
      return;
    }

    const value = parseSaleValue(saleValue);
    if (!Number.isFinite(value) || value <= 0) {
      showToast({
        message: "Informe o valor da venda, maior que zero.",
        tone: "erro",
      });
      return;
    }

    setIsSaving(true);
    const result = await closeLeadAction(closingLead.id, value, "BRL");
    setIsSaving(false);

    if (result.error) {
      showToast({ message: result.error, tone: "erro", duration: 8000 });
      return;
    }

    setOverrides((current) => {
      const next = new Map(current);
      next.set(closingLead.id, "fechado");
      return next;
    });
    setClosingLead(null);
    setSaleValue("");
    showToast({ message: result.success ?? "Negócio fechado registrado." });
    router.refresh();
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allVisibleSelected =
    visible.length > 0 && visible.every((lead) => selected.has(lead.id));

  const cards = [
    { label: "Leads no período", value: String(data.summary.total) },
    { label: "Pendentes de avaliação", value: String(data.summary.pending) },
    { label: "Qualificados", value: String(data.summary.qualified) },
    { label: "Negócios fechados", value: String(data.summary.closed) },
    {
      label: "Taxa de qualificação",
      value: `${data.summary.qualificationRate.toFixed(0)}%`,
    },
  ];

  return (
    <div className="min-w-0 space-y-5">
      {data.notice ? (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-300">
          {data.notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="py-5">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="mt-2 font-display text-3xl font-semibold text-foreground">
                {card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {QUALIFICATION_TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateParams((p) => p.set("aba", item.key))}
                className={cn(
                  "h-10 rounded-full border px-4 text-sm transition",
                  tab === item.key
                    ? "border-primary bg-primary/[0.12] font-medium text-primary"
                    : "border-border/70 text-muted-foreground hover:text-foreground dark:border-white/10",
                )}
              >
                {item.label}
                <span className="ml-1.5 text-xs opacity-80">
                  {item.key === "todos"
                    ? data.summary.total
                    : item.key === "pendente"
                      ? data.summary.pending
                      : item.key === "qualificado"
                        ? data.summary.qualified
                        : item.key === "desqualificado"
                          ? data.summary.discarded
                          : data.summary.closed}
                </span>
              </button>
            ))}

            {isNavigating ? (
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Período
              <select
                value={period}
                onChange={(event) =>
                  updateParams((p) => p.set("periodo", event.target.value))
                }
                className="h-10 rounded-xl border border-border/70 bg-background/60 px-3 text-sm text-foreground outline-none focus:border-primary dark:border-white/10 dark:bg-black/25"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {isAdmin ? (
              <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                Cliente
                <select
                  value={selectedClientId ?? ""}
                  onChange={(event) =>
                    updateParams((p) => {
                      if (event.target.value) {
                        p.set("cliente", event.target.value);
                      } else {
                        p.delete("cliente");
                      }
                    })
                  }
                  className="h-10 min-w-0 max-w-[16rem] rounded-xl border border-border/70 bg-background/60 px-3 text-sm text-foreground outline-none focus:border-primary dark:border-white/10 dark:bg-black/25"
                >
                  <option value="">Todos os clientes</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {selected.size > 0 ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selected.size} selecionado{selected.size === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => qualifySelected("qualificado")}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
                >
                  <ThumbsUp className="size-4" />
                  Marcar como qualificados
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => qualifySelected("desqualificado")}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border/70 px-4 text-sm text-foreground transition hover:border-primary/40 disabled:opacity-60 dark:border-white/10"
                >
                  <ThumbsDown className="size-4" />
                  Descartar
                </button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {visible.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <>
          {/* Desktop: tabela. Celular: cards — o cliente revisa muito no telefone. */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[64rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground dark:border-white/10">
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todos"
                          checked={allVisibleSelected}
                          onChange={() =>
                            setSelected(
                              allVisibleSelected
                                ? new Set()
                                : new Set(visible.map((lead) => lead.id)),
                            )
                          }
                          className="size-4 rounded border-border"
                        />
                      </th>
                      <th className="px-4 py-3 font-medium">Data</th>
                      <th className="px-4 py-3 font-medium">Nome</th>
                      <th className="px-4 py-3 font-medium">Telefone</th>
                      {isAdmin ? (
                        <th className="px-4 py-3 font-medium">Cliente</th>
                      ) : null}
                      <th className="px-4 py-3 font-medium">Origem</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((lead) => (
                      <tr
                        key={lead.id}
                        className={cn(
                          "border-b border-border/40 transition-all duration-300 last:border-b-0 dark:border-white/[0.06]",
                          leaving.has(lead.id) && "opacity-0 -translate-x-3",
                        )}
                      >
                        <td className="px-4 py-3 align-middle">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${lead.name ?? "lead"}`}
                            checked={selected.has(lead.id)}
                            onChange={() => toggleSelected(lead.id)}
                            className="size-4 rounded border-border"
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-middle text-muted-foreground">
                          {dateTime(lead.createdAt)}
                        </td>
                        <td className="max-w-[14rem] px-4 py-3 align-middle">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-foreground">
                              {lead.name || "Sem nome"}
                            </span>
                            {!lead.hasClickId ? <NoClickIdWarning /> : null}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-middle text-muted-foreground">
                          {maskPhone(lead.phone)}
                        </td>
                        {isAdmin ? (
                          <td className="max-w-[12rem] px-4 py-3 align-middle">
                            <span className="block truncate text-muted-foreground">
                              {lead.clientName ?? "—"}
                            </span>
                          </td>
                        ) : null}
                        <td className="max-w-[16rem] px-4 py-3 align-middle">
                          <span className="block truncate text-muted-foreground">
                            {lead.campaignName ?? "Não identificada"}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className="flex flex-col items-start gap-1">
                            <QualificationBadge
                              qualification={lead.qualification}
                            />
                            {lead.capiStatus === "enviado" ? (
                              <AlreadySentWarning sentAt={lead.capiSentAt} />
                            ) : null}
                            {isAdmin && lead.capiStatus === "erro" ? (
                              <CapiErrorBadge lead={lead} />
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right align-middle">
                          <LeadActions
                            lead={lead}
                            disabled={isSaving}
                            onQualify={qualifyOne}
                            onClose={openCloseDialog}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3 lg:hidden">
            {visible.map((lead) => (
              <Card
                key={lead.id}
                className={cn(
                  "transition-all duration-300",
                  leaving.has(lead.id) && "opacity-0 -translate-x-3",
                )}
              >
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${lead.name ?? "lead"}`}
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelected(lead.id)}
                      className="mt-1 size-4 shrink-0 rounded border-border"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-foreground">
                          {lead.name || "Sem nome"}
                        </span>
                        {!lead.hasClickId ? <NoClickIdWarning /> : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {maskPhone(lead.phone)}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {dateTime(lead.createdAt)} ·{" "}
                        {lead.campaignName ?? "Não identificada"}
                      </p>
                      {isAdmin && lead.clientName ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {lead.clientName}
                        </p>
                      ) : null}
                    </div>
                    <QualificationBadge qualification={lead.qualification} />
                  </div>

                  {lead.capiStatus === "enviado" ? (
                    <AlreadySentWarning sentAt={lead.capiSentAt} />
                  ) : null}
                  {isAdmin && lead.capiStatus === "erro" ? (
                    <CapiErrorBadge lead={lead} />
                  ) : null}

                  <LeadActions
                    lead={lead}
                    disabled={isSaving}
                    onQualify={qualifyOne}
                    onClose={openCloseDialog}
                    full
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination
            page={data.page}
            hasMore={data.hasMore}
            total={data.totalInTab}
            pageSize={data.pageSize}
            onGo={(next) =>
              updateParams(
                (p) => {
                  if (next > 1) {
                    p.set("pagina", String(next));
                  } else {
                    p.delete("pagina");
                  }
                },
                { resetPage: false },
              )
            }
          />
        </>
      )}

      {closingLead ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) {
              setClosingLead(null);
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-lead-title"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmClose();
            }}
            className="w-full max-w-md rounded-2xl border border-border/70 bg-background p-5 shadow-2xl dark:border-white/10"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="close-lead-title"
                  className="font-display text-xl font-semibold text-foreground"
                >
                  Registrar negócio fechado
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {closingLead.name || "Lead sem nome"} ·{" "}
                  {maskPhone(closingLead.phone)}
                </p>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setClosingLead(null)}
                aria-label="Fechar"
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <label className="mt-5 block text-sm font-medium text-foreground">
              Valor da venda
              <span className="mt-2 flex h-11 items-center rounded-xl border border-border/70 bg-background px-3 focus-within:border-primary dark:border-white/10">
                <span className="mr-2 text-sm text-muted-foreground">R$</span>
                <input
                  autoFocus
                  required
                  inputMode="decimal"
                  value={saleValue}
                  onChange={(event) => setSaleValue(event.target.value)}
                  placeholder="0,00"
                  className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                />
              </span>
            </label>

            {!closingLead.hasClickId ? (
              <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                Este lead não tem o identificador do anúncio. A venda será salva,
                mas não poderá ser atribuída com segurança à campanha na Meta.
              </p>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                A Meta receberá o evento Purchase com o valor e a moeda BRL.
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setClosingLead(null)}
                className="h-10 rounded-full border border-border/70 px-4 text-sm text-foreground disabled:opacity-50 dark:border-white/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
              >
                {isSaving ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <BadgeDollarSign className="size-4" aria-hidden />
                )}
                Confirmar venda
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function LeadActions({
  lead,
  disabled,
  onQualify,
  onClose,
  full,
}: {
  lead: ConversionLead;
  disabled: boolean;
  onQualify: (lead: ConversionLead, q: LeadQualification) => void;
  onClose: (lead: ConversionLead) => void;
  full?: boolean;
}) {
  return (
    <div
      className={cn("flex items-center gap-2", full ? "w-full" : "justify-end")}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onQualify(lead, "qualificado")}
        aria-pressed={lead.qualification === "qualificado"}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-sm transition disabled:opacity-60",
          full && "flex-1",
          lead.qualification === "qualificado"
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "border-border/70 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-600 dark:border-white/10",
        )}
      >
        <ThumbsUp className="size-4" />
        Qualificado
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onQualify(lead, "desqualificado")}
        aria-pressed={lead.qualification === "desqualificado"}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-sm transition disabled:opacity-60",
          full && "flex-1",
          lead.qualification === "desqualificado"
            ? "border-border bg-muted text-foreground dark:border-white/20 dark:bg-white/10"
            : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground dark:border-white/10",
        )}
      >
        <ThumbsDown className="size-4" />
        Desqualificar
      </button>

      <button
        type="button"
        disabled={disabled || lead.qualification === "fechado"}
        onClick={() => onClose(lead)}
        aria-pressed={lead.qualification === "fechado"}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-sm transition disabled:opacity-60",
          full && "flex-1",
          lead.qualification === "fechado"
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-primary dark:border-white/10",
        )}
      >
        <BadgeDollarSign className="size-4" aria-hidden />
        Fechado
      </button>
    </div>
  );
}

function Pagination({
  page,
  hasMore,
  total,
  pageSize,
  onGo,
}: {
  page: number;
  hasMore: boolean;
  total: number;
  pageSize: number;
  onGo: (page: number) => void;
}) {
  if (page === 1 && !hasMore) {
    return null;
  }

  const primeiro = (page - 1) * pageSize + 1;
  const ultimo = primeiro + pageSize - 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">
        Mostrando {primeiro} a {Math.min(ultimo, total || ultimo)}
        {total ? ` de ${total}` : ""}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onGo(page - 1)}
          className="h-10 rounded-full border border-border/70 px-4 text-sm text-foreground transition disabled:opacity-40 dark:border-white/10"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={!hasMore}
          onClick={() => onGo(page + 1)}
          className="h-10 rounded-full border border-border/70 px-4 text-sm text-foreground transition disabled:opacity-40 dark:border-white/10"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: QualificationTab }) {
  const mensagem =
    tab === "pendente"
      ? "Nada pendente por aqui. Quando chegarem leads das suas campanhas, eles aparecem nesta aba para você marcar quais foram bons. Isso ensina o Meta a buscar mais pessoas parecidas."
      : tab === "qualificado"
        ? "Nenhum lead marcado como qualificado neste período."
        : tab === "desqualificado"
          ? "Nenhum lead desqualificado neste período."
          : tab === "fechado"
            ? "Nenhum negócio fechado neste período."
            : "Quando chegarem leads das suas campanhas, eles aparecem aqui para você avaliar e registrar as vendas.";

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Badge variant="secondary">Sem leads</Badge>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          {mensagem}
        </p>
      </CardContent>
    </Card>
  );
}
