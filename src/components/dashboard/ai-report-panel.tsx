"use client";

import { useActionState, useMemo, useState } from "react";
import { Copy, MessageCircleMore, Sparkles } from "lucide-react";
import {
  generateAiReportAction,
  type GenerateReportState,
} from "@/app/admin/relatorios-ia/actions";
import {
  PeriodFilter,
  type PeriodFilterValue,
} from "@/components/dashboard/period-filter";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const [customRange, setCustomRange] = useState({
    start: "2026-04-01",
    end: "2026-04-08",
  });
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);

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
  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const effectiveSelectedCampaignIds =
    selectedCampaignIds.length > 0
      ? selectedCampaignIds
      : availableCampaigns.map((campaign) => campaign.id);
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
          <Button
            type="submit"
            form="generate-ai-report-form"
            variant="outline"
            className="gap-2 rounded-full"
          >
            <Sparkles className="size-4" />
            Gerar novamente
          </Button>
        </div>

        <form id="generate-ai-report-form" action={formAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Cliente</label>
              <Select
                name="clientId"
                value={selectedClientId}
                onChange={(event) => {
                  setSelectedClientId(event.target.value);
                  setSelectedCampaignIds([]);
                  setDraftText(null);
                }}
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
            <div className="grid gap-3">
              {availableCampaigns.length > 0 ? (
                availableCampaigns.map((campaign) => (
                  <label
                    key={campaign.id}
                    className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3"
                  >
                    <input
                      type="checkbox"
                      name="campaignIds"
                      value={campaign.id}
                      checked={effectiveSelectedCampaignIds.includes(campaign.id)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedCampaignIds(() =>
                          checked
                            ? Array.from(
                                new Set([...effectiveSelectedCampaignIds, campaign.id]),
                              )
                            : effectiveSelectedCampaignIds.filter(
                                (item) => item !== campaign.id,
                              ),
                        );
                      }}
                      className="mt-1 size-4 rounded border-border"
                    />
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.platform} • {campaign.status}
                      </p>
                    </div>
                  </label>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                  Nenhuma campanha encontrada para esse cliente.
                </div>
              )}
            </div>
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
        </form>

        <Textarea
          className="min-h-[240px]"
          value={text}
          onChange={(event) => setDraftText(event.target.value)}
        />

        <div className="flex flex-wrap gap-3">
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

        {latestReport ? (
          <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
            Último relatório salvo:{" "}
            <strong className="text-foreground">
              {latestReport.clientName}
            </strong>{" "}
            • {latestReport.periodLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
