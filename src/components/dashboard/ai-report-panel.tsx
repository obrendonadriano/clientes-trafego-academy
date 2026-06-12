"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Copy, MessageCircleMore, Sparkles } from "lucide-react";
import {
  generateAiReportAction,
  type GenerateReportState,
} from "@/app/admin/relatorios-ia/actions";
import { CampaignMultiSelect } from "@/components/admin/campaign-multi-select";
import {
  PeriodFilter,
  type PeriodFilterValue,
} from "@/components/dashboard/period-filter";
import { Button } from "@/components/ui/button";
import { FormPendingButton } from "@/components/ui/form-pending-button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getDefaultCustomRange } from "@/lib/dashboard-metrics";
import { generateWhatsappLink } from "@/lib/whatsapp";
import type {
  CampaignWithMetrics,
  CampaignPermission,
  Client,
  ReportHistoryItem,
  User,
} from "@/lib/types";

type AiReportPanelProps = {
  initialText: string;
  initialWhatsapp: string;
  clients: Client[];
  campaigns: CampaignWithMetrics[];
  clientUsers: User[];
  permissions: CampaignPermission[];
  reports: ReportHistoryItem[];
};

const initialState: GenerateReportState = {};

// Textarea com shimmer durante a geração — precisa estar dentro do form para
// ler useFormStatus, por isso é um componente separado.
function ReportTextarea({
  text,
  onChange,
}: {
  text: string;
  onChange: (value: string) => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="relative">
      <Textarea
        className="min-h-[240px]"
        value={text}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
      />
      {pending ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-[2px]">
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
  reports,
}: AiReportPanelProps) {
  const [state, formAction] = useActionState(generateAiReportAction, initialState);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [period, setPeriod] = useState<PeriodFilterValue>("Últimos 30 dias");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [customRange, setCustomRange] = useState(() => getDefaultCustomRange());

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

  // Seleção real de campanhas (controlada): começa com todas do cliente e é
  // redefinida quando o cliente muda.
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

  // Quando uma nova análise chega do servidor, descarta o rascunho local para
  // exibir o texto recém-gerado (padrão de estado derivado durante o render).
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

  const latestReport = reports[0];

  return (
    <div className="rounded-3xl border border-border/60 bg-background/60 p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Análise com IA</p>
            <h3 className="mt-1 font-display text-2xl font-semibold">
              Texto editável antes de enviar ao cliente
            </h3>
          </div>
        </div>

        <form id="generate-ai-report-form" action={formAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Cliente</label>
              <Select
                name="clientId"
                value={selectedClientId}
                onChange={(event) => handleClientChange(event.target.value)}
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
            <input type="hidden" name="period" value={period} />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Campanhas</p>
            {availableCampaigns.length > 0 ? (
              <CampaignMultiSelect
                campaigns={availableCampaigns}
                value={selectedCampaignIds}
                onChange={setSelectedCampaignIds}
                showSelectionSummary
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                Nenhuma campanha encontrada para esse cliente.
              </div>
            )}
          </div>

          <PeriodFilter
            active={period}
            onChange={setPeriod}
            comparePrevious={comparePrevious}
            onComparePreviousChange={setComparePrevious}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            onApplyCustomRange={() => setPeriod("Personalizado")}
          />

          <input type="hidden" name="customStart" value={customRange.start} />
          <input type="hidden" name="customEnd" value={customRange.end} />

          {state?.error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          {state?.success ? (
            <p className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {state.success}
            </p>
          ) : null}

          <ReportTextarea text={text} onChange={setDraftText} />

          <div className="flex flex-wrap gap-3">
            <FormPendingButton
              type="submit"
              variant="outline"
              className="gap-2 rounded-full"
              disabled={selectedCampaignIds.length === 0}
              idleLabel="Gerar mensagem"
              pendingLabel="Gerando mensagem..."
            >
              <Sparkles className="size-4" />
              Gerar mensagem
            </FormPendingButton>
            <Button
              type="button"
              variant="outline"
              className="gap-2 rounded-full"
              onClick={() => navigator.clipboard.writeText(text)}
            >
              <Copy className="size-4" />
              Copiar mensagem
            </Button>
            <a
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircleMore className="size-4" />
              Abrir no WhatsApp
            </a>
          </div>
        </form>

        {latestReport ? (
          <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
            Último relatório salvo:{" "}
            <strong className="text-foreground">
              {latestReport.clientName}
            </strong>{" "}
            • {latestReport.periodLabel}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
            Nenhum relatório gerado ainda. A primeira análise aparecerá aqui.
          </div>
        )}
      </div>
    </div>
  );
}
