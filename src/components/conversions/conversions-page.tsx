"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Car, GripVertical, LoaderCircle, MessageCircle, X } from "lucide-react";
import {
  moveLeadsAction,
  saveAcquisitionCostAction,
} from "@/app/conversoes/actions";
import {
  AlreadySentWarning,
  CapiErrorBadge,
} from "@/components/conversions/lead-badges";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  conversionFeedback,
  FUNNEL_STAGES,
  maskPhone,
  PERIOD_OPTIONS,
  QUALIFICATION_TABS,
  type ConversionLead,
  type ConversionLeadsResult,
  type FunnelStage,
  type PeriodOption,
  type QualificationTab,
} from "@/lib/conversions/shared";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const control =
  "h-10 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export function ConversionsPage({
  data,
  tab,
  period,
  isAdmin,
  clients,
  selectedClientId,
}: {
  data: ConversionLeadsResult;
  tab: QualificationTab;
  period: PeriodOption;
  isAdmin: boolean;
  clients: { id: string; name: string }[];
  selectedClientId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<FunnelStage | null>(null);
  const [costLead, setCostLead] = useState<ConversionLead | null>(null);
  const [costValue, setCostValue] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (costLead) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [costLead]);

  const totals: Record<FunnelStage, number> = {
    pendente: data.summary.pending,
    qualificado: data.summary.qualified,
    fechado: data.summary.closed,
  };

  function navigate(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== "pagina") params.delete("pagina");
    startTransition(() =>
      router.replace(`${pathname}?${params}`, { scroll: false }),
    );
  }

  function move(lead: ConversionLead, stage: FunnelStage) {
    if (isPending || lead.qualification === stage) return;

    startTransition(async () => {
      try {
        const result = await moveLeadsAction([lead.id], stage);
        showToast({
          message: result.error ?? result.success ?? "Etapa atualizada.",
          tone: result.error ? "erro" : undefined,
        });
      } catch {
        showToast({
          message:
            "Não foi possível confirmar a alteração. Atualize a página antes de tentar novamente.",
          tone: "erro",
        });
      }
    });
  }

  function saveCost() {
    if (!costLead || isPending) return;

    const compact = costValue.trim().replace(/\s/g, "");
    const value = Number(
      compact.includes(",")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact,
    );

    if (!Number.isFinite(value) || value <= 0) {
      showToast({ message: "Informe um valor maior que zero.", tone: "erro" });
      return;
    }

    startTransition(async () => {
      try {
        const result = await saveAcquisitionCostAction(costLead.id, value, "BRL");
        if (result.error) {
          showToast({ message: result.error, tone: "erro" });
          return;
        }
        setCostLead(null);
        showToast({ message: result.success ?? "Valor registrado." });
      } catch {
        showToast({
          message:
            "Não foi possível confirmar o registro. Atualize a página antes de tentar novamente.",
          tone: "erro",
        });
      }
    });
  }

  const visibleStages = FUNNEL_STAGES.filter(
    (stage) => tab === "todos" || stage.key === tab,
  );

  return (
    <div className="min-w-0 space-y-5" aria-busy={isPending}>
      {data.notice ? (
        <p
          role="alert"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
        >
          {data.notice}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Leads no período", value: data.summary.total },
          { label: "Aguardando avaliação", value: data.summary.pending },
          { label: "Veículos comprados", value: data.summary.closed },
          {
            label: "Taxa de qualificação",
            value: `${data.summary.qualificationRate.toFixed(0)}%`,
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-display text-3xl font-semibold">
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              Período
              <select
                className={control}
                value={period}
                disabled={isPending}
                onChange={(e) => navigate("periodo", e.target.value)}
              >
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              Etapa
              <select
                className={control}
                value={tab}
                disabled={isPending}
                onChange={(e) => navigate("aba", e.target.value)}
              >
                {QUALIFICATION_TABS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {isAdmin ? (
              <label className="flex min-w-0 items-center gap-2 text-sm">
                Cliente
                <select
                  className={cn(control, "min-w-0 max-w-60")}
                  value={selectedClientId ?? ""}
                  disabled={isPending}
                  onChange={(e) => navigate("cliente", e.target.value)}
                >
                  <option value="">Todos os clientes</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              className={cn(control, "ml-auto")}
              disabled={isPending}
              onClick={() => startTransition(() => router.refresh())}
            >
              Atualizar
            </button>
            {isPending ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-label="Salvando ou carregando"
              />
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Arraste os cartões entre as etapas ou use “Mover para” no cartão,
            inclusive no celular.
          </p>
          <p className="text-xs text-muted-foreground">
            O período considera a chegada do lead. Voltar um cartão e avançar de
            novo não envia a mesma conversão duas vezes.
          </p>
        </CardContent>
      </Card>

      <div
        className={cn(
          "grid min-w-0 gap-4",
          tab === "todos" ? "md:grid-cols-2 xl:grid-cols-3" : "max-w-xl",
        )}
      >
        {visibleStages.map((stage) => {
          const leads = data.leads.filter(
            (lead) => lead.qualification === stage.key,
          );

          return (
            <section
              key={stage.key}
              aria-label={stage.label}
              onDragOver={(e) => {
                if (draggedId && !isPending) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropTarget(stage.key);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const lead = data.leads.find((l) => l.id === draggedId);
                setDraggedId(null);
                setDropTarget(null);
                if (lead) move(lead, stage.key);
              }}
              className={cn(
                "min-w-0 rounded-2xl border border-t-4 border-border/70 bg-muted/25 p-3 transition",
                stage.color,
                dropTarget === stage.key && "bg-primary/10 ring-2 ring-primary",
              )}
            >
              <div className="mb-4 px-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{stage.label}</h2>
                  <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium">
                    {totals[stage.key]}
                  </span>
                </div>
                <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">
                  {stage.description}
                </p>
                {totals[stage.key] > leads.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {leads.length} de {totals[stage.key]} nesta página
                  </p>
                ) : null}
              </div>

              <div className="space-y-3">
                {leads.map((lead) => (
                  <article
                    key={lead.id}
                    draggable={!isPending}
                    onDragStart={(e) => {
                      if (
                        (e.target as HTMLElement).closest("a,button,select,input")
                      ) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData("text/plain", lead.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedId(lead.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDropTarget(null);
                    }}
                    className={cn(
                      "min-w-0 rounded-xl border border-border/60 bg-card p-3 shadow-sm",
                      draggedId === lead.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical
                        className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold">
                          {lead.name || "Lead sem nome"}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {maskPhone(lead.phone)}
                        </p>
                      </div>
                      <a
                        href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Abrir conversa com ${lead.name || "lead"} no WhatsApp`}
                        className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-500/10"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    </div>

                    <p className="mt-3 truncate text-xs text-muted-foreground">
                      {lead.campaignName ??
                        (lead.fromAd
                          ? lead.adSourceId
                            ? `Anúncio ${lead.adSourceId}`
                            : "Anúncio no WhatsApp"
                          : "Origem não identificada")}
                    </p>
                    {isAdmin ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {lead.clientName}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {date.format(new Date(lead.createdAt))}
                    </p>

                    {lead.note ? (
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs">
                        {lead.note}
                      </p>
                    ) : null}

                    {lead.qualification === "fechado" ? (
                      <p className="mt-3 text-sm font-medium">
                        {lead.value !== null ? (
                          `Valor pago: ${money.format(lead.value)}`
                        ) : (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              setCostValue("");
                              setCostLead(lead);
                            }}
                            className="text-xs font-normal text-primary underline-offset-4 hover:underline"
                          >
                            Registrar valor pago (opcional)
                          </button>
                        )}
                      </p>
                    ) : null}

                    <div className="mt-3 text-xs text-muted-foreground">
                      {lead.capiStatus === "enviado" ? (
                        <AlreadySentWarning sentAt={lead.capiSentAt} />
                      ) : lead.capiStatus === "erro" && isAdmin ? (
                        <CapiErrorBadge lead={lead} />
                      ) : (
                        conversionFeedback(lead)
                      )}
                    </div>

                    <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      Mover para
                      <select
                        className={cn(control, "min-w-0 flex-1 text-xs")}
                        aria-label={`Mover ${lead.name || "lead"} para`}
                        value={
                          FUNNEL_STAGES.some((s) => s.key === lead.qualification)
                            ? lead.qualification
                            : "pendente"
                        }
                        disabled={isPending}
                        onChange={(e) =>
                          move(lead, e.target.value as FunnelStage)
                        }
                      >
                        {FUNNEL_STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                ))}

                {leads.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    {totals[stage.key]
                      ? "Nenhum lead desta etapa nesta página."
                      : "Nenhum lead nesta etapa no período."}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {data.hasMore || data.page > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            Página {data.page} · até {data.pageSize} leads{" "}
            {tab === "todos" ? "por etapa" : "por página"}
          </p>
          <div className="flex gap-2">
            <button
              className={control}
              disabled={isPending || data.page <= 1}
              onClick={() => navigate("pagina", String(data.page - 1))}
            >
              Anterior
            </button>
            <button
              className={control}
              disabled={isPending || !data.hasMore}
              onClick={() => navigate("pagina", String(data.page + 1))}
            >
              Próxima
            </button>
          </div>
        </div>
      ) : null}

      <dialog
        ref={dialogRef}
        aria-labelledby="cost-title"
        onCancel={(e) => {
          if (isPending) e.preventDefault();
          else setCostLead(null);
        }}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-background p-5 text-foreground shadow-2xl backdrop:bg-black/60"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveCost();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="cost-title" className="font-display text-xl font-semibold">
              Valor pago pelo veículo
            </h2>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setCostLead(null)}
              aria-label="Fechar"
              className="rounded-full p-1"
            >
              <X className="size-5" />
            </button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {costLead?.name || "Lead sem nome"}
          </p>
          <label className="mt-5 block text-sm font-medium">
            Valor pago (R$)
            <input
              required
              inputMode="decimal"
              className={cn(control, "mt-2 w-full")}
              value={costValue}
              onChange={(e) => setCostValue(e.target.value)}
              placeholder="0,00"
              disabled={isPending}
            />
          </label>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Este é o custo de aquisição do veículo e fica só no seu controle
            interno. Ele não é enviado à Meta e não conta como receita.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className={control}
              disabled={isPending}
              onClick={() => setCostLead(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Car className="size-4" />
              )}
              Salvar
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
