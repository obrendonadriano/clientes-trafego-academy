import { getMockAdLevelRows } from "@/lib/mock-data";
import type { MetricsWindow } from "@/lib/data/date-range";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { getCampaignIdsForClient } from "@/lib/data/queries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdLevelRow = {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  // Só no nível de anúncio: a que conjunto ele pertence.
  adSetId?: string;
  adSetName?: string;
  amountSpent: number;
  amountSpentOriginal: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  results: number;
  resultLabel: string;
  costPerResult: number;
  currency: string;
  exchangeRate: number;
  status: "Ativa" | "Pausada" | "Não sincronizado";
  effectiveStatus: string;
};

export type AdLevelData = {
  rows: AdLevelRow[];
  // Mensagem quando não dá para ler a Meta (sem conta, sem token, erro).
  notice?: string;
};

type DbAdLevelSummaryRow = {
  external_id: string;
  name: string;
  campaign_id: string;
  campaign_name: string;
  adset_external_id: string | null;
  adset_name: string | null;
  amount_spent: number | string;
  amount_spent_original?: number | string;
  impressions: number | string;
  clicks: number | string;
  result_count: number | string;
  result_label: string;
  currency: string;
  exchange_rate?: number | string;
  status?: string | null;
  effective_status?: string | null;
};

export async function getAdLevelData(
  level: "adset" | "ad",
  window: MetricsWindow,
  clientId?: string | null,
  filters?: { campaignId?: string | null; adSetId?: string | null },
  authorizedCampaignIds?: readonly string[] | null,
): Promise<AdLevelData> {
  if (!isSupabaseAdminConfigured()) {
    const authorized = authorizedCampaignIds
      ? new Set(authorizedCampaignIds)
      : null;
    return {
      rows: getMockAdLevelRows(level, clientId).filter(
        (row) => !authorized || authorized.has(row.campaignId),
      ),
    };
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return { rows: [], notice: "Supabase não configurado." };
  }

  const allowed = authorizedCampaignIds
    ? new Set(authorizedCampaignIds)
    : clientId
      ? await getCampaignIdsForClient(clientId)
      : null;
  if (filters?.campaignId && allowed && !allowed.has(filters.campaignId)) {
    return { rows: [] };
  }

  const campaignIds = filters?.campaignId
    ? [filters.campaignId]
    : allowed
      ? [...allowed]
      : null;
  if (campaignIds && campaignIds.length === 0) {
    return { rows: [] };
  }

  const { data, error } = await adminClient.rpc("get_meta_ad_level_summary", {
    p_level: level,
    p_start: window.startDate,
    p_end: window.endDate,
    p_campaign_ids: campaignIds,
    p_adset_external_id: filters?.adSetId ?? null,
  });

  if (error || !data) {
    return {
      rows: [],
      notice:
        "Os snapshots de conjuntos e anúncios ainda não estão disponíveis. Aplique a migration e execute uma sincronização.",
    };
  }

  const summaryRows = data as DbAdLevelSummaryRow[];
  const hasEnrichedSnapshots = summaryRows.every(
    (row) => row.exchange_rate !== undefined && row.status !== undefined,
  );
  const fallbackRates = new Map<string, number>();

  // Compatibilidade durante a aplicação da migration: o snapshot antigo
  // guarda USD bruto. A cotação média ponderada da própria campanha converte
  // esses valores corretamente, sem exibir dólar como se fosse real.
  if (!hasEnrichedSnapshots && summaryRows.length > 0) {
    const ids = [...new Set(summaryRows.map((row) => row.campaign_id))];
    const metrics = await adminClient
      .from("campaign_metrics")
      .select("campaign_id, amount_spent, exchange_rate")
      .eq("granularity", "day")
      .gte("date", window.startDate)
      .lte("date", window.endDate)
      .in("campaign_id", ids);

    const totals = new Map<string, { brl: number; original: number }>();
    for (const metric of metrics.data ?? []) {
      const rate = Number(metric.exchange_rate || 1) || 1;
      const brl = Number(metric.amount_spent || 0);
      const current = totals.get(metric.campaign_id) ?? { brl: 0, original: 0 };
      current.brl += brl;
      current.original += brl / rate;
      totals.set(metric.campaign_id, current);
    }

    for (const [campaignId, total] of totals) {
      fallbackRates.set(
        campaignId,
        total.original > 0 ? total.brl / total.original : 1,
      );
    }
  }

  return {
    notice: hasEnrichedSnapshots
      ? undefined
      : "A atualização de status está pronta no código e será exibida após aplicar a migration e sincronizar a Meta uma vez.",
    rows: summaryRows.map((row) => {
      const storedAmount = Number(row.amount_spent || 0);
      const exchangeRate =
        Number(row.exchange_rate || 0) || fallbackRates.get(row.campaign_id) || 1;
      const amountSpent =
        row.exchange_rate === undefined ? storedAmount * exchangeRate : storedAmount;
      const amountSpentOriginal = Number(
        row.amount_spent_original ?? storedAmount,
      );
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      const results = Number(row.result_count || 0);

      return {
        id: row.external_id,
        name: row.name,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        adSetId: row.adset_external_id ?? undefined,
        adSetName: row.adset_name ?? undefined,
        amountSpent,
        amountSpentOriginal,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? amountSpent / clicks : 0,
        results,
        resultLabel: row.result_label,
        costPerResult: results > 0 ? amountSpent / results : 0,
        currency: row.currency,
        exchangeRate,
        status:
          row.status === "ACTIVE"
            ? "Ativa"
            : row.status === "PAUSED"
              ? "Pausada"
              : "Não sincronizado",
        effectiveStatus: row.effective_status ?? row.status ?? "UNKNOWN",
      };
    }),
  };
}
