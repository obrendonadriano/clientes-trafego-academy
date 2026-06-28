"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Check,
  Copy,
  MessageCircleMore,
  Sparkles,
  Users,
} from "lucide-react";
import {
  generateAiReportAction,
  type GenerateReportState,
} from "@/app/admin/relatorios-ia/actions";
import { CampaignMultiSelect } from "@/components/admin/campaign-multi-select";
import { periods, type PeriodFilterValue } from "@/components/dashboard/period-filter";
import { Button } from "@/components/ui/button";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPeriodLabel, getDefaultCustomRange } from "@/lib/dashboard-metrics";
import { cn } from "@/lib/utils";
import { generateWhatsappLink } from "@/lib/whatsapp";
import type {
  CampaignWithMetrics,
  CampaignPermission,
  Client,
  User,
} from "@/lib/types";

type AiReportPanelProps = {
  initialText: string;
  initialWhatsapp: string;
  clients: Client[];
  campaigns: CampaignWithMetrics[];
  clientUsers: User[];
  permissions: CampaignPermission[];
};

const initialState: GenerateReportState = {};

function StepLabel({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
        {index}
      </span>
      <span className="text-sm font-semibold text-foreground">{children}</span>
    </div>
  );
}

// Textarea com shimmer durante a geração e altura automática conforme o texto.
// Precisa estar dentro do form para ler useFormStatus.
function ReportTextarea({
  text,
  onChange,
}: {
  text: string;
  onChange: (value: string) => void;
}) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    element.style.height = "auto";
    element.style.height = `${Math.max(element.scrollHeight, 320)}px`;
  }, [text]);

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        className="min-h-[320px] resize-none text-[0.95rem] leading-7"
        value={text}
        disabled={pending}
        placeholder="A análise gerada pela IA aparecerá aqui. Você pode editar o texto livremente antes de enviar."
        onChange={(event) => onChange(event.target.value)}
      />
      {pending ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-[1.35rem] bg-background/70 backdrop-blur-[2px]">
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Sparkles className="size-4 animate-pulse text-primary" />
            Gerando análise…
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function AiReportPanel({
  initialText,
  initialWhatsapp,
  clients,
  campaigns,
  clientUsers,
  permissions,
}: AiReportPanelProps) {
  const [state, formAction] = useActionState(generateAiReportAction, initialState);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [customRange, setCustomRange] = useState(() => getDefaultCustomRange());
  const [copied, setCopied] = useState(false);

  // Copia com feedback visual. Tem fallback para contextos sem a Clipboard API
  // (ex.: navegador antigo ou conexão não-segura).
  async function copyMessage(value: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const area = document.createElement("textarea");
        area.value = value;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const availableCampaigns = useMemo(() => {
    if (!selectedClientId) {
      return campaigns;
    }

    const linkedUser = clientUsers.find(
      (user) => user.role === "client" && user.clientId === selectedClientId,
    );

    const permissionCampaignIds = linkedUser
      ? new Set(
          permissions
            .filter((permission) => permission.userId === linkedUser.id)
            .map((permission) => permission.campaignId),
        )
      : new Set<string>();

    return campaigns.filter(
      (campaign) =>
        campaign.clientId === selectedClientId ||
        permissionCampaignIds.has(campaign.id),
    );
  }, [campaigns, clientUsers, permissions, selectedClientId]);

  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>(() =>
    availableCampaigns.map((campaign) => campaign.id),
  );

  function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);
    setDraftText(null);

    const linkedUser = clientUsers.find(
      (user) => user.role === "client" && user.clientId === clientId,
    );
    const permissionCampaignIds = linkedUser
      ? new Set(
          permissions
            .filter((permission) => permission.userId === linkedUser.id)
            .map((permission) => permission.campaignId),
        )
      : new Set<string>();

    setSelectedCampaignIds(
      campaigns
        .filter(
          (campaign) =>
            campaign.clientId === clientId || permissionCampaignIds.has(campaign.id),
        )
        .map((campaign) => campaign.id),
    );
  }

  const [lastServerText, setLastServerText] = useState(state.text);
  if (state.text !== lastServerText) {
    setLastServerText(state.text);
    if (state.text) {
      setDraftText(null);
    }
  }

  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const text = draftText ?? state.text ?? initialText;
  const whatsapp = state.whatsapp ?? selectedClient?.whatsapp ?? initialWhatsapp;

  const whatsappLink = useMemo(
    () => generateWhatsappLink(whatsapp, text),
    [text, whatsapp],
  );

  const periodLabel = formatPeriodLabel(period, customRange);
  const canGenerate = selectedCampaignIds.length > 0 && Boolean(selectedClientId);

  return (
    <form action={formAction} className="grid min-w-0 gap-6 xl:grid-cols-[0.82fr_1.18fr]">
      {/* COLUNA ESQUERDA — configuração */}
      <div className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div className="dashboard-card min-w-0 space-y-6 rounded-[1.5rem] border p-5">
          {/* 1 · Cliente */}
          <div className="space-y-3">
            <StepLabel index={1}>Cliente</StepLabel>
            <div className="relative min-w-0">
              <Users className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Select
                name="clientId"
                value={selectedClientId}
                onChange={(event) => handleClientChange(event.target.value)}
                className="pl-11"
              >
                <option value="" disabled>
                  Selecione um cliente
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.companyName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* 2 · Campanhas */}
          <div className="space-y-3">
            <StepLabel index={2}>Campanhas</StepLabel>
            {availableCampaigns.length > 0 ? (
              <CampaignMultiSelect
                campaigns={availableCampaigns}
                value={selectedCampaignIds}
                onChange={setSelectedCampaignIds}
                showSelectionSummary
                dense
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                Nenhuma campanha encontrada para esse cliente.
              </div>
            )}
          </div>

          {/* 3 · Período */}
          <div className="space-y-3">
            <StepLabel index={3}>Período</StepLabel>
            <div className="flex flex-wrap gap-1.5">
              {periods.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPeriod(option)}
                  className={cn(
                    "min-h-9 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition active:scale-[0.985]",
                    period === option
                      ? "border-primary bg-primary text-white"
                      : "border-border/70 bg-card/70 text-muted-foreground hover:border-primary/30 hover:text-foreground dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.06]",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            {period === "Personalizado" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">De</span>
                  <input
                    type="date"
                    value={customRange.start}
                    max={customRange.end}
                    onChange={(event) =>
                      setCustomRange((range) => ({ ...range, start: event.target.value }))
                    }
                    className="flex h-12 w-full min-w-0 rounded-2xl border border-input bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-ring dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Até</span>
                  <input
                    type="date"
                    value={customRange.end}
                    min={customRange.start}
                    onChange={(event) =>
                      setCustomRange((range) => ({ ...range, end: event.target.value }))
                    }
                    className="flex h-12 w-full min-w-0 rounded-2xl border border-input bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-ring dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
              </div>
            ) : null}
          </div>

          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="customStart" value={customRange.start} />
          <input type="hidden" name="customEnd" value={customRange.end} />

          <FormPendingButton
            type="submit"
            size="lg"
            className="w-full gap-2"
            disabled={!canGenerate}
            idleLabel="Gerar mensagem"
            pendingLabel="Gerando mensagem..."
          >
            <Sparkles className="size-4" />
            Gerar mensagem
          </FormPendingButton>

          {state.error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          {state.success ? (
            <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {state.success}
            </p>
          ) : null}
        </div>
      </div>

      {/* COLUNA DIREITA — editor (foco) */}
      <div className="min-w-0">
        <div className="dashboard-card flex min-w-0 flex-col rounded-[1.5rem] border p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  Mensagem para o cliente
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedClient?.companyName ?? "Selecione um cliente"} • {periodLabel}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-muted/70 px-2.5 py-1 text-xs text-muted-foreground dark:bg-white/[0.05]">
              {text.length} caracteres
            </span>
          </div>

          <div className="mt-4">
            <ReportTextarea text={text} onChange={setDraftText} />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 gap-2 rounded-2xl"
              disabled={!text}
              onClick={() => copyMessage(text)}
            >
              {copied ? (
                <>
                  <Check className="size-4 text-emerald-500" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copiar
                </>
              )}
            </Button>
            <a
              className={cn(
                "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90",
                !text && "pointer-events-none opacity-50",
              )}
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!text}
            >
              <MessageCircleMore className="size-4" />
              Abrir no WhatsApp
            </a>
          </div>
        </div>
      </div>
    </form>
  );
}
