import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchMetaCampaigns, fetchMetaInsights, getMetaAdsConfig } from "@/lib/meta-ads";
import { IntegrationProvider, SyncStatus } from "@/lib/types";

const META_SYNC_INTERVAL_MINUTES = 15;
const META_PROVIDER: IntegrationProvider = "meta_ads";

type CampaignImportRow = {
  nome: string;
  status: string;
  plataforma: string;
  external_id: string;
  source: string;
  client_id: null;
};

type MetricImportRow = {
  campaign_id: string;
  date: string;
  amount_spent: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  result_count: number;
  result_label: string;
  cpc: number;
  cpm: number;
  leads: number;
  cost_per_lead: number;
  roi: number;
  roas: number;
  frequency: number;
};

type SyncStatusRow = {
  id: string;
  provider: string;
};

type CampaignLookupRow = {
  id: string;
  external_id: string | null;
};

type SyncStatusPayload = {
  provider: IntegrationProvider;
  interval_minutes: number;
  status: SyncStatus["status"];
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  next_run_at?: string | null;
  message?: string | null;
  updated_at: string;
};

export type MetaSyncResult = {
  campaignCount: number;
  metricCount: number;
  lastSuccessAt: string;
  nextRunAt: string;
};

function getPrioritizedActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: string[],
) {
  if (!actions) return 0;

  for (const type of types) {
    const match = actions.find(
      (item) => item.action_type === type && Number(item.value || 0) > 0,
    );

    if (match) {
      return Number(match.value || 0);
    }
  }

  return 0;
}

function getPrimaryResult(
  actions: Array<{ action_type: string; value: string }> | undefined,
) {
  if (!actions || actions.length === 0) {
    return {
      count: 0,
      label: "Sem resultado",
    };
  }

  const priorities: Array<{
    types: string[];
    label: string;
  }> = [
    {
      types: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
      label: "Compras no site",
    },
    {
      types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
      label: "Leads no site",
    },
    {
      types: ["onsite_web_lead", "onsite_conversion.messaging_conversation_started_7d"],
      label: "Leads",
    },
    {
      types: ["complete_registration", "onsite_conversion.complete_registration"],
      label: "Cadastros",
    },
    {
      types: ["landing_page_view"],
      label: "Visualizações da página",
    },
  ];

  for (const priority of priorities) {
    const count = getPrioritizedActionValue(actions, priority.types);

    if (count > 0) {
      return {
        count,
        label: priority.label,
      };
    }
  }

  const firstAction = actions.find((item) => Number(item.value || 0) > 0);

  if (!firstAction) {
    return {
      count: 0,
      label: "Sem resultado",
    };
  }

  return {
    count: Number(firstAction.value || 0),
    label: firstAction.action_type.replaceAll("_", " "),
  };
}

function getNextRunAt(baseDate = new Date()) {
  const nextDate = new Date(baseDate);
  nextDate.setSeconds(0, 0);

  const minutes = nextDate.getMinutes();
  const nextSlot = Math.ceil((minutes + 1) / META_SYNC_INTERVAL_MINUTES) * META_SYNC_INTERVAL_MINUTES;

  if (nextSlot >= 60) {
    nextDate.setHours(nextDate.getHours() + 1, 0, 0, 0);
    return nextDate.toISOString();
  }

  nextDate.setMinutes(nextSlot, 0, 0);
  return nextDate.toISOString();
}

async function persistSyncStatus(input: Omit<SyncStatusPayload, "provider" | "interval_minutes" | "updated_at">) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return;
  }

  const payload: SyncStatusPayload = {
    provider: META_PROVIDER,
    interval_minutes: META_SYNC_INTERVAL_MINUTES,
    updated_at: new Date().toISOString(),
    ...input,
  };

  const existing = await adminClient
    .from("sync_statuses")
    .select("id, provider")
    .eq("provider", META_PROVIDER)
    .maybeSingle<SyncStatusRow>();

  if (existing.error) {
    return;
  }

  if (existing.data) {
    await adminClient
      .from("sync_statuses")
      .update(payload)
      .eq("id", existing.data.id);
    return;
  }

  await adminClient.from("sync_statuses").insert(payload);
}

async function upsertCampaignRows(rows: CampaignImportRow[]) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para importar campanhas.");
  }

  for (const row of rows) {
    const existing = await adminClient
      .from("campaigns")
      .select("id")
      .eq("external_id", row.external_id)
      .maybeSingle<{ id: string }>();

    if (existing.error) {
      throw new Error(existing.error.message);
    }

    const { error } = existing.data
      ? await adminClient.from("campaigns").update(row).eq("id", existing.data.id)
      : await adminClient.from("campaigns").insert(row);

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function upsertMetricRows(rows: MetricImportRow[]) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para importar métricas.");
  }

  for (const row of rows) {
    const existing = await adminClient
      .from("campaign_metrics")
      .select("id")
      .eq("campaign_id", row.campaign_id)
      .eq("date", row.date)
      .maybeSingle<{ id: string }>();

    if (existing.error) {
      throw new Error(existing.error.message);
    }

    const { error } = existing.data
      ? await adminClient.from("campaign_metrics").update(row).eq("id", existing.data.id)
      : await adminClient.from("campaign_metrics").insert(row);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function importMetaCampaigns() {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para importar campanhas.");
  }

  const config = await getMetaAdsConfig();

  if (!config.enabled || !config.accessToken || !config.adAccountId) {
    throw new Error(
      "Conecte a Meta Ads em Configurações, informe o Ad Account ID e ative a integração antes de importar.",
    );
  }

  const result = await fetchMetaCampaigns({
    adAccountId: config.adAccountId,
    accessToken: config.accessToken,
  });

  const rows: CampaignImportRow[] = result.data.map((campaign) => ({
    nome: campaign.name,
    status: campaign.status === "ACTIVE" ? "Ativa" : "Pausada",
    plataforma: "Meta Ads",
    external_id: campaign.id,
    source: "meta_ads",
    client_id: null,
  }));

  await upsertCampaignRows(rows);

  return rows.length;
}

export async function importMetaInsights() {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para importar métricas.");
  }

  const config = await getMetaAdsConfig();

  if (!config.enabled || !config.accessToken || !config.adAccountId) {
    throw new Error(
      "Conecte a Meta Ads em Configurações, informe o Ad Account ID e ative a integração antes de importar métricas.",
    );
  }

  const [last30DaysInsights, todayInsights] = await Promise.all([
    fetchMetaInsights({
      adAccountId: config.adAccountId,
      accessToken: config.accessToken,
      datePreset: "last_30d",
    }),
    fetchMetaInsights({
      adAccountId: config.adAccountId,
      accessToken: config.accessToken,
      datePreset: "today",
    }),
  ]);

  const { data: campaigns, error: campaignsError } = await adminClient
    .from("campaigns")
    .select("id, external_id");

  if (campaignsError || !campaigns) {
    throw new Error(
      campaignsError?.message ?? "Não foi possível mapear as campanhas locais antes da sincronização.",
    );
  }

  const campaignIdByExternalId = new Map(
    (campaigns as CampaignLookupRow[])
      .filter((campaign) => campaign.external_id)
      .map((campaign) => [campaign.external_id as string, campaign.id]),
  );

  const rows = [...last30DaysInsights.data, ...todayInsights.data]
    .map((item) => {
      const campaignId = campaignIdByExternalId.get(item.campaign_id);

      if (!campaignId) {
        return null;
      }

      const leads = getPrioritizedActionValue(item.actions, [
        "lead",
        "onsite_conversion.lead_grouped",
        "offsite_conversion.fb_pixel_lead",
      ]);
      const primaryResult = getPrimaryResult(item.actions);

      const roas =
        item.purchase_roas?.reduce(
          (sum, current) => sum + Number(current.value || 0),
          0,
        ) ?? 0;

      const spend = Number(item.spend || 0);

      return {
        campaign_id: campaignId,
        date: item.date_start,
        amount_spent: spend,
        reach: Number(item.reach || 0),
        impressions: Number(item.impressions || 0),
        clicks: Number(item.clicks || 0),
        ctr: Number(item.ctr || 0),
        result_count: primaryResult.count,
        result_label: primaryResult.label,
        cpc: Number(item.cpc || 0),
        cpm: Number(item.cpm || 0),
        leads,
        cost_per_lead: leads > 0 ? spend / leads : 0,
        roi: 0,
        roas,
        frequency: Number(item.frequency || 0),
      };
    })
    .filter((row): row is MetricImportRow => Boolean(row));

  const uniqueRows = Array.from(
    new Map(rows.map((row) => [`${row.campaign_id}:${row.date}`, row] as const)).values(),
  );

  if (uniqueRows.length === 0) {
    throw new Error(
      "Nenhuma métrica foi importada. Verifique se as campanhas já foram importadas e se a conta possui dados disponíveis.",
    );
  }

  await upsertMetricRows(uniqueRows);

  return uniqueRows.length;
}

export async function runMetaSync() {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();

  await persistSyncStatus({
    status: "running",
    last_attempt_at: startedAtIso,
    message: "Sincronização automática da Meta Ads em andamento.",
  });

  try {
    const campaignCount = await importMetaCampaigns();
    const metricCount = await importMetaInsights();
    const finishedAt = new Date();
    const finishedAtIso = finishedAt.toISOString();
    const nextRunAt = getNextRunAt(finishedAt);

    await persistSyncStatus({
      status: "success",
      last_attempt_at: startedAtIso,
      last_success_at: finishedAtIso,
      next_run_at: nextRunAt,
      message: `Última sincronização concluída com ${campaignCount} campanha(s) e ${metricCount} registro(s) de métricas.`,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/campanhas");
    revalidatePath("/admin/clientes");
    revalidatePath("/dashboard");

    return {
      campaignCount,
      metricCount,
      lastSuccessAt: finishedAtIso,
      nextRunAt,
    } satisfies MetaSyncResult;
  } catch (error) {
    const nextRunAt = getNextRunAt(new Date());
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao sincronizar Meta Ads.";

    await persistSyncStatus({
      status: "error",
      last_attempt_at: startedAtIso,
      next_run_at: nextRunAt,
      message,
    });

    throw error;
  }
}

export async function getMetaSyncStatus(): Promise<SyncStatus> {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return {
      provider: META_PROVIDER,
      intervalMinutes: META_SYNC_INTERVAL_MINUTES,
      status: "pending",
      lastAttemptAt: null,
      lastSuccessAt: null,
      nextRunAt: null,
      message: "Supabase ainda não foi conectado para ativar a sincronização automática.",
    };
  }

  const { data, error } = await adminClient
    .from("sync_statuses")
    .select("provider, interval_minutes, status, last_attempt_at, last_success_at, next_run_at, message")
    .eq("provider", META_PROVIDER)
    .maybeSingle<{
      provider: IntegrationProvider;
      interval_minutes: number;
      status: SyncStatus["status"];
      last_attempt_at: string | null;
      last_success_at: string | null;
      next_run_at: string | null;
      message: string | null;
    }>();

  if (error || !data) {
    return {
      provider: META_PROVIDER,
      intervalMinutes: META_SYNC_INTERVAL_MINUTES,
      status: "pending",
      lastAttemptAt: null,
      lastSuccessAt: null,
      nextRunAt: null,
      message: "A sincronização automática ainda não registrou nenhuma execução.",
    };
  }

  return {
    provider: data.provider,
    intervalMinutes: data.interval_minutes ?? META_SYNC_INTERVAL_MINUTES,
    status: data.status,
    lastAttemptAt: data.last_attempt_at,
    lastSuccessAt: data.last_success_at,
    nextRunAt: data.next_run_at,
    message: data.message,
  };
}
