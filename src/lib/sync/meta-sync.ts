import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  fetchMetaAds,
  fetchMetaAdSets,
  fetchMetaCampaigns,
  fetchMetaInsights,
  fetchMetaLevelInsights,
  getCurrencyRateToBrl,
  getDailyRatesToBrl,
  resolveRateForDay,
  MetaPermissionError,
  MetaRateLimitError,
  MetaTemporaryError,
  MetaTokenExpiredError,
} from "@/lib/meta-ads";
import {
  getSyncableMetaAccounts,
  setMetaAccountSyncStatus,
  type ResolvedMetaAccount,
} from "@/lib/meta/accounts";
import {
  getResultActionTypesForCategory,
  getResultCategoryFromAdSet,
  getResultCategoryFromObjective,
  getResultLabelForCategory,
  isStrongResultCategory,
  type ResultCategory,
} from "@/lib/dashboard-metrics";
import { IntegrationProvider, SyncStatus } from "@/lib/types";

const META_PROVIDER: IntegrationProvider = "meta_ads";

// Importante: client_id NÃO faz parte do payload de import. O banco detecta o
// codigo no nome e faz o vinculo automatico por trigger, preservando qualquer
// liberacao/vinculo manual feito pelo admin.
type CampaignImportRow = {
  nome: string;
  status: string;
  plataforma: string;
  external_id: string;
  source: string;
  // Objetivo da campanha (ex.: OUTCOME_SALES) — define o resultado principal.
  objective: string | null;
  // Origem da campanha (null para a conta única antiga via fallback).
  meta_account_id: string | null;
};

type MetricImportRow = {
  campaign_id: string;
  date: string;
  granularity: "day" | "hour";
  hour_bucket: number;
  hour_label: string;
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
  // Moeda original da conta e taxa usada na conversão para BRL.
  currency: string;
  exchange_rate: number;
};

type AdLevelMetricImportRow = {
  meta_account_id: string | null;
  ad_account_id: string;
  level: "adset" | "ad";
  external_id: string;
  name: string;
  campaign_id: string;
  campaign_name: string;
  adset_external_id: string | null;
  adset_name: string | null;
  date: string;
  amount_spent: number;
  impressions: number;
  clicks: number;
  result_count: number;
  result_label: string;
  currency: string;
  exchange_rate: number;
  status: string;
  effective_status: string;
  updated_at: string;
};

type CampaignLookupRow = {
  id: string;
  external_id: string | null;
  objective: string | null;
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
  adLevelMetricCount: number;
  lastSuccessAt: string;
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

function parseMetaHourBreakdown(value?: string) {
  if (!value) {
    return {
      hourBucket: -1,
      hourLabel: "",
    };
  }

  const match = value.match(/^(\d{1,2})/);
  const hourBucket = match ? Number(match[1]) : -1;

  return {
    hourBucket,
    hourLabel: hourBucket >= 0 ? `${String(hourBucket).padStart(2, "0")}h` : value,
  };
}

// Conversões "detectáveis" pelas ações, em ordem de relevância de negócio.
const DYNAMIC_RESULT_CATEGORIES: ResultCategory[] = [
  "purchase",
  "lead",
  "messaging",
  "traffic",
];

// Resultado principal da campanha.
// - Objetivo FORTE (compra/lead/mensagem): devolve a contagem dessa categoria
//   mesmo que seja 0 (campanha de venda sem vendas → "Compras no site: 0").
// - Objetivo GENÉRICO (tráfego/engajamento/etc.): detecta a conversão REAL que
//   a campanha gera. Ex.: tráfego para WhatsApp gera "Conversas por mensagens",
//   não "Cliques no link".
// Nunca soma action_types (a Meta repete a mesma conversão em vários tipos).
function getPrimaryResult(
  actions: Array<{ action_type: string; value: string }> | undefined,
  category: ResultCategory,
) {
  if (isStrongResultCategory(category)) {
    return {
      count: getPrioritizedActionValue(actions, getResultActionTypesForCategory(category)),
      label: getResultLabelForCategory(category),
    };
  }

  for (const dynamic of DYNAMIC_RESULT_CATEGORIES) {
    const count = getPrioritizedActionValue(
      actions,
      getResultActionTypesForCategory(dynamic),
    );

    if (count > 0) {
      return { count, label: getResultLabelForCategory(dynamic) };
    }
  }

  // Sem conversão detectável: mantém o rótulo da categoria do objetivo com 0.
  return { count: 0, label: getResultLabelForCategory(category) };
}

async function persistSyncStatus(input: Omit<SyncStatusPayload, "provider" | "interval_minutes" | "updated_at">) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return;
  }

  const payload: SyncStatusPayload = {
    provider: META_PROVIDER,
    // A coluna é mantida por compatibilidade com o schema existente, mas zero
    // deixa explícito que não há intervalo/agendamento automático.
    interval_minutes: 0,
    next_run_at: null,
    updated_at: new Date().toISOString(),
    ...input,
  };

  await adminClient
    .from("sync_statuses")
    .upsert(payload, { onConflict: "provider" });
}

const SYNC_LOCK_STALE_MS = 10 * 60 * 1000;

async function claimMetaSync(startedAtIso: string) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para sincronizar.");
  }

  const payload = {
    status: "running" as const,
    last_attempt_at: startedAtIso,
    message: "Atualização manual dos dados da Meta Ads em andamento.",
    updated_at: startedAtIso,
  };
  const staleBefore = new Date(Date.now() - SYNC_LOCK_STALE_MS).toISOString();
  const claimed = await adminClient
    .from("sync_statuses")
    .update(payload)
    .eq("provider", META_PROVIDER)
    .or(`status.neq.running,last_attempt_at.is.null,last_attempt_at.lt.${staleBefore}`)
    .select("provider")
    .maybeSingle<{ provider: string }>();

  if (claimed.error) {
    throw new Error(claimed.error.message);
  }

  if (claimed.data) {
    return true;
  }

  const inserted = await adminClient.from("sync_statuses").insert({
    provider: META_PROVIDER,
    interval_minutes: 0,
    next_run_at: null,
    ...payload,
  });

  if (!inserted.error) {
    return true;
  }

  if (inserted.error.code === "23505") {
    return false;
  }

  throw new Error(inserted.error.message);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function upsertCampaignRows(rows: CampaignImportRow[]) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para importar campanhas.");
  }

  if (rows.length === 0) {
    return;
  }

  // Upsert em lote por external_id. Como client_id não está no payload, o
  // ON CONFLICT não sobrescreve vinculos manuais. O trigger do Supabase
  // reconcilia o prefixo de quatro digitos depois de cada insert/rename.
  for (const batch of chunk(rows, 500)) {
    const { error } = await adminClient
      .from("campaigns")
      .upsert(batch, { onConflict: "external_id" });

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

  // Upsert em lote sobre a chave única (campaign_id, date, granularity,
  // hour_bucket), substituindo o select+insert por linha (2 idas ao banco
  // por métrica) que dominava o tempo de sincronização.
  for (const batch of chunk(rows, 500)) {
    const { error } = await adminClient
      .from("campaign_metrics")
      .upsert(batch, { onConflict: "campaign_id,date,granularity,hour_bucket" });

    if (error) {
      throw new Error(error.message);
    }
  }
}

function metricRowKey(
  row: Pick<MetricImportRow, "campaign_id" | "date" | "granularity" | "hour_bucket">,
) {
  return `${row.campaign_id}:${row.date}:${row.granularity}:${row.hour_bucket}`;
}

// A Meta pode revisar atribuições e até deixar de devolver uma linha diária que
// existia numa sincronização anterior. Upsert sozinho não remove essa sobra e o
// painel continua somando gasto/resultados antigos. Depois de gravar o retrato
// novo, removemos somente as chaves que não vieram mais da Meta no mesmo período.
async function removeStaleMetricRows(input: {
  campaignIds: string[];
  importedRows: MetricImportRow[];
  startDate: string;
  endDate: string;
}) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient || input.campaignIds.length === 0) {
    return;
  }

  const importedKeys = new Set(input.importedRows.map(metricRowKey));
  const staleIds: string[] = [];

  for (const campaignBatch of chunk(input.campaignIds, 100)) {
    let offset = 0;

    while (true) {
      const { data, error } = await adminClient
        .from("campaign_metrics")
        .select("id, campaign_id, date, granularity, hour_bucket")
        .in("campaign_id", campaignBatch)
        .gte("date", input.startDate)
        .lte("date", input.endDate)
        .order("id", { ascending: true })
        .range(offset, offset + 999);

      if (error) {
        throw new Error(error.message);
      }

      const rows = (data ?? []) as Array<{
        id: string;
        campaign_id: string;
        date: string;
        granularity: "day" | "hour";
        hour_bucket: number;
      }>;

      for (const row of rows) {
        if (!importedKeys.has(metricRowKey(row))) {
          staleIds.push(row.id);
        }
      }

      if (rows.length < 1000) {
        break;
      }

      offset += rows.length;
    }
  }

  for (const staleBatch of chunk(staleIds, 500)) {
    const { error } = await adminClient
      .from("campaign_metrics")
      .delete()
      .in("id", staleBatch);

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function upsertAdLevelMetricRows(rows: AdLevelMetricImportRow[]) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para importar anúncios.");
  }

  for (const batch of chunk(rows, 500)) {
    const { error } = await adminClient.from("meta_ad_level_metrics").upsert(batch, {
      onConflict: "level,ad_account_id,external_id,date",
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}

function saoPauloIsoDay(daysAgo = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - daysAgo * 86_400_000));
}

export async function importMetaAdLevelMetrics(account: ResolvedMetaAccount) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para importar anúncios.");
  }

  const adAccountId = account.adAccountId.replace(/^act_/i, "").trim();
  const existing = await adminClient
    .from("meta_ad_level_metrics")
    .select("id")
    .eq("ad_account_id", adAccountId)
    .limit(1);

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  // Primeira carga: 92 dias para cobrir todos os presets. Depois: janela
  // incremental de 7 dias, suficiente para reconciliar atribuições recentes.
  const days = existing.data && existing.data.length > 0 ? 7 : 92;
  const since = saoPauloIsoDay(days - 1);
  const until = saoPauloIsoDay();
  let campaignQuery = adminClient
    .from("campaigns")
    .select("id, external_id, objective");
  if (account.id) {
    campaignQuery = campaignQuery.eq("meta_account_id", account.id);
  }

  const [campaignResult, adSetResult, adResult, adSets, ads] = await Promise.all([
    campaignQuery,
    fetchMetaLevelInsights({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
      level: "adset",
      since,
      until,
      daily: true,
    }),
    fetchMetaLevelInsights({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
      level: "ad",
      since,
      until,
      daily: true,
    }),
    fetchMetaAdSets({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
    }),
    fetchMetaAds({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
    }),
  ]);

  if (campaignResult.error || !campaignResult.data) {
    throw new Error(
      campaignResult.error?.message ?? "Não foi possível mapear campanhas para os anúncios.",
    );
  }

  const campaigns = campaignResult.data as CampaignLookupRow[];
  const campaignByExternalId = new Map(
    campaigns
      .filter((campaign) => campaign.external_id)
      .map((campaign) => [campaign.external_id as string, campaign]),
  );
  const now = new Date().toISOString();
  const rows: AdLevelMetricImportRow[] = [];
  const currency = (
    adSetResult.data[0]?.account_currency ||
    adResult.data[0]?.account_currency ||
    "BRL"
  ).toUpperCase();
  const [currentRate, dailyRates] = await Promise.all([
    getCurrencyRateToBrl(currency),
    getDailyRatesToBrl(currency, days + 7),
  ]);
  const adSetById = new Map(adSets.data.map((item) => [item.id, item]));
  const adById = new Map(ads.data.map((item) => [item.id, item]));

  for (const [level, insights] of [
    ["adset", adSetResult.data],
    ["ad", adResult.data],
  ] as const) {
    for (const insight of insights) {
      const campaign = campaignByExternalId.get(insight.campaign_id);
      const externalId = level === "ad" ? insight.ad_id : insight.adset_id;

      if (!campaign || !externalId || !insight.date_start) {
        continue;
      }

      const category = getResultCategoryFromObjective(campaign.objective);
      const primaryResult = getPrimaryResult(insight.actions, category);
      const entity = level === "ad" ? adById.get(externalId) : adSetById.get(externalId);
      const rate = resolveRateForDay(dailyRates, insight.date_start, currentRate);

      rows.push({
        meta_account_id: account.id,
        ad_account_id: adAccountId,
        level,
        external_id: externalId,
        name:
          (level === "ad" ? insight.ad_name : insight.adset_name) ?? "Sem nome",
        campaign_id: campaign.id,
        campaign_name: insight.campaign_name,
        adset_external_id: level === "ad" ? (insight.adset_id ?? null) : null,
        adset_name: level === "ad" ? (insight.adset_name ?? null) : null,
        date: insight.date_start,
        amount_spent: Number(insight.spend || 0) * rate,
        impressions: Number(insight.impressions || 0),
        clicks: Number(insight.clicks || 0),
        result_count: primaryResult.count,
        result_label: primaryResult.label,
        currency,
        exchange_rate: rate,
        status: entity?.status ?? "UNKNOWN",
        effective_status: entity?.effective_status ?? entity?.status ?? "UNKNOWN",
        updated_at: now,
      });
    }
  }

  await upsertAdLevelMetricRows(rows);
  return rows.length;
}

export async function importMetaCampaigns(account: ResolvedMetaAccount) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para importar campanhas.");
  }

  const result = await fetchMetaCampaigns({
    adAccountId: account.adAccountId,
    accessToken: account.accessToken,
  });

  const rows: CampaignImportRow[] = result.data.map((campaign) => ({
    nome: campaign.name,
    status: campaign.status === "ACTIVE" ? "Ativa" : "Pausada",
    plataforma: "Meta Ads",
    external_id: campaign.id,
    source: "meta_ads",
    objective: campaign.objective ?? null,
    meta_account_id: account.id,
  }));

  await upsertCampaignRows(rows);

  return rows.length;
}

export async function importMetaInsights(account: ResolvedMetaAccount) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado para importar métricas.");
  }

  // A atualização é manual e o usuário espera um retrato exato ao clicar.
  // Reconsultamos sempre os 30 dias para incorporar revisões de atribuição da
  // Meta, em vez de manter conversões antigas fora de uma janela incremental.
  const dailyPreset = "last_30d";

  const [
    last30DaysInsights,
    todayDailyInsights,
    todayHourlyInsights,
    yesterdayHourlyInsights,
  ] = await Promise.all([
    fetchMetaInsights({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
      datePreset: dailyPreset,
    }),
    // Dia de HOJE em granularidade diária. Sem isso, os dados de hoje só
    // existiriam como hora-a-hora e seriam descartados ao somar por dia
    // (o histórico last_30d fecha em ontem).
    fetchMetaInsights({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
      datePreset: "today",
    }),
    fetchMetaInsights({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
      datePreset: "today",
      breakdown: "hourly_stats_aggregated_by_advertiser_time_zone",
    }),
    fetchMetaInsights({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
      datePreset: "yesterday",
      breakdown: "hourly_stats_aggregated_by_advertiser_time_zone",
    }),
  ]);

  // Mapeia só as campanhas DESTA conta (fallback: todas, quando não há vínculo).
  let campaignQuery = adminClient
    .from("campaigns")
    .select("id, external_id, objective");
  campaignQuery = account.id
    ? campaignQuery.eq("meta_account_id", account.id)
    : campaignQuery;

  const { data: campaigns, error: campaignsError } = await campaignQuery;

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
  // Categoria de resultado por external_id (derivada do objetivo da campanha).
  const categoryByExternalId = new Map<string, ResultCategory>(
    (campaigns as CampaignLookupRow[])
      .filter((campaign) => campaign.external_id)
      .map((campaign) => [
        campaign.external_id as string,
        getResultCategoryFromObjective(campaign.objective),
      ]),
  );

  // Refina a categoria com o destino/meta de otimização dos conjuntos de
  // anúncios (ex.: destino WhatsApp → mensagens, mesmo que o objetivo seja
  // "Leads"). Se a busca falhar (permissão), mantém a categoria do objetivo.
  try {
    const adSets = await fetchMetaAdSets({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
    });

    for (const adSet of adSets.data) {
      if (!adSet.campaign_id) {
        continue;
      }

      const refined = getResultCategoryFromAdSet(
        adSet.optimization_goal,
        adSet.destination_type,
      );

      if (!refined) {
        continue;
      }

      // Mensagens tem prioridade (WhatsApp); senão, define se ainda não havia
      // refinamento melhor que o objetivo.
      const current = categoryByExternalId.get(adSet.campaign_id);
      if (refined === "messaging" || current === undefined || !isStrongResultCategory(current)) {
        categoryByExternalId.set(adSet.campaign_id, refined);
      }
    }
  } catch {
    // Sem acesso aos conjuntos de anúncios: segue com a categoria do objetivo.
  }

  // Moeda da conta (a Meta informa por insight). Contas em moeda estrangeira
  // (ex.: USD) têm os valores convertidos para BRL pela cotação atual, para
  // que os clientes sempre vejam reais.
  const accountCurrency =
    last30DaysInsights.data.find((item) => item.account_currency)?.account_currency ??
    todayDailyInsights.data.find((item) => item.account_currency)?.account_currency ??
    todayHourlyInsights.data.find((item) => item.account_currency)?.account_currency ??
    "BRL";
  const currencyRate = await getCurrencyRateToBrl(accountCurrency);
  // Série diária: cada dia de gasto é convertido pela cotação daquele dia.
  // Se a série falhar, `resolveRateForDay` cai na cotação atual.
  const dailyRates = await getDailyRatesToBrl(accountCurrency);

  const rows = [
    ...last30DaysInsights.data.map((item) => ({
      ...item,
      granularity: "day" as const,
      hour_bucket: -1,
      hour_label: "",
    })),
    // Hoje em granularidade diária (sobrescreve a linha de hoje do last_30d
    // se já existir, mantendo o valor mais atualizado).
    ...todayDailyInsights.data.map((item) => ({
      ...item,
      granularity: "day" as const,
      hour_bucket: -1,
      hour_label: "",
    })),
    ...todayHourlyInsights.data.map((item) => {
      const hour = parseMetaHourBreakdown(
        item.hourly_stats_aggregated_by_advertiser_time_zone,
      );

      return {
        ...item,
        granularity: "hour" as const,
        hour_bucket: hour.hourBucket,
        hour_label: hour.hourLabel,
      };
    }),
    ...yesterdayHourlyInsights.data.map((item) => {
      const hour = parseMetaHourBreakdown(
        item.hourly_stats_aggregated_by_advertiser_time_zone,
      );

      return {
        ...item,
        granularity: "hour" as const,
        hour_bucket: hour.hourBucket,
        hour_label: hour.hourLabel,
      };
    }),
  ]
    .map((item) => {
      const campaignId = campaignIdByExternalId.get(item.campaign_id);

      if (!campaignId) {
        return null;
      }

      const leads = getPrioritizedActionValue(item.actions, [
        "lead",
        "onsite_conversion.lead_grouped",
        "offsite_conversion.fb_pixel_lead",
        "onsite_web_lead",
        "onsite_conversion.messaging_conversation_started_7d",
        "onsite_conversion.total_messaging_connection",
        "onsite_conversion.total_messaging_connection_7d",
        "onsite_conversion.messaging_first_reply",
      ]);
      const category: ResultCategory =
        categoryByExternalId.get(item.campaign_id) ?? "other";
      const primaryResult = getPrimaryResult(item.actions, category);
      const normalizedLeads =
        leads > 0 ||
        !["Leads no site", "Leads", "Cadastros"].includes(primaryResult.label)
          ? leads
          : primaryResult.count;

      // ROAS: a Meta repete o valor em vários action_types (mesma conversão);
      // pega o maior, não soma, para não inflar.
      const roas =
        item.purchase_roas?.reduce(
          (max, current) => Math.max(max, Number(current.value || 0)),
          0,
        ) ?? 0;

      // Valores monetários convertidos para BRL pela cotação do dia do gasto
      // (rate = 1 quando a conta já é em real). ROAS é razão e não muda.
      const rate = resolveRateForDay(dailyRates, item.date_start, currencyRate);
      const spend = Number(item.spend || 0) * rate;

      return {
        campaign_id: campaignId,
        date: item.date_start,
        granularity: item.granularity,
        hour_bucket: item.hour_bucket,
        hour_label: item.hour_label,
        amount_spent: spend,
        reach: Number(item.reach || 0),
        impressions: Number(item.impressions || 0),
        clicks: Number(item.clicks || 0),
        ctr: Number(item.ctr || 0),
        result_count: primaryResult.count,
        result_label: primaryResult.label,
        cpc: Number(item.cpc || 0) * rate,
        cpm: Number(item.cpm || 0) * rate,
        leads: normalizedLeads,
        cost_per_lead: normalizedLeads > 0 ? spend / normalizedLeads : 0,
        roi: 0,
        roas,
        frequency: Number(item.frequency || 0),
        currency: (accountCurrency || "BRL").toUpperCase(),
        exchange_rate: rate,
      };
    })
    .filter((row): row is MetricImportRow => Boolean(row));

  const uniqueRows = Array.from(
    new Map(
      rows.map((row) => [
        metricRowKey(row),
        row,
      ] as const),
    ).values(),
  );

  // Primeiro grava o retrato novo; só depois remove as linhas que não vieram
  // mais. Assim, uma falha no upsert nunca apaga o último snapshot válido.
  if (uniqueRows.length > 0) {
    await upsertMetricRows(uniqueRows);
  }

  await removeStaleMetricRows({
    campaignIds: (campaigns as CampaignLookupRow[]).map((campaign) => campaign.id),
    importedRows: uniqueRows,
    // last_30d fecha em ontem e a consulta "today" completa o dia corrente.
    startDate: saoPauloIsoDay(30),
    endDate: saoPauloIsoDay(),
  });

  return uniqueRows.length;
}

function describeAccountError(error: unknown) {
  if (error instanceof MetaTokenExpiredError) {
    // error.message já traz o motivo real da Meta (ex.: sessão expirada).
    return `${error.message}. Gere um novo token em Configurações.`;
  }

  if (error instanceof MetaPermissionError) {
    return `${error.message}. Verifique se este token tem acesso a esta conta de anúncio.`;
  }

  if (error instanceof MetaRateLimitError) {
    return "A Meta limitou as requisições desta conta. Será retomada na próxima sincronização.";
  }

  if (error instanceof MetaTemporaryError) {
    return "A Meta ficou instável e não respondeu depois de várias tentativas. Os dados já importados continuam valendo; a próxima sincronização completa o restante.";
  }

  return error instanceof Error ? error.message : "Falha inesperada ao sincronizar a conta.";
}

export async function runMetaSync() {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();

  const claimed = await claimMetaSync(startedAtIso);

  if (!claimed) {
    throw new Error("Já existe uma sincronização da Meta Ads em andamento.");
  }

  const accounts = await getSyncableMetaAccounts();

  if (accounts.length === 0) {
    const message =
      "Nenhuma conta de anúncio ativa. Cadastre ao menos uma conta em Configurações → Meta Ads.";

    await persistSyncStatus({
      status: "error",
      last_attempt_at: startedAtIso,
      message,
    });
    revalidateTag("sync", "max");

    throw new Error(message);
  }

  let campaignCount = 0;
  let metricCount = 0;
  let adLevelMetricCount = 0;
  let okCount = 0;
  const failures: string[] = [];

  // Cada conta é sincronizada de forma isolada: um token expirado numa conta
  // não impede as outras de sincronizarem.
  for (const account of accounts) {
    try {
      campaignCount += await importMetaCampaigns(account);
      metricCount += await importMetaInsights(account);
      adLevelMetricCount += await importMetaAdLevelMetrics(account);
      okCount += 1;

      if (account.id) {
        await setMetaAccountSyncStatus(account.id, "ok", null);
      }
    } catch (error) {
      const detail = describeAccountError(error);
      failures.push(`${account.label}: ${detail}`);

      if (account.id) {
        await setMetaAccountSyncStatus(account.id, "error", detail);
      }
    }
  }

  const finishedAt = new Date();
  const finishedAtIso = finishedAt.toISOString();
  const allFailed = okCount === 0;

  const summary = allFailed
    ? `Falha ao sincronizar todas as contas. ${failures.join(" | ")}`
    : failures.length > 0
      ? `${okCount}/${accounts.length} conta(s) sincronizada(s): ${campaignCount} campanha(s), ${metricCount} métricas de campanha e ${adLevelMetricCount} métricas de anúncios. Com erro: ${failures.join(" | ")}`
      : `Sincronização concluída: ${okCount} conta(s), ${campaignCount} campanha(s), ${metricCount} métricas de campanha e ${adLevelMetricCount} métricas de anúncios.`;

  await persistSyncStatus({
    status: allFailed ? "error" : "success",
    last_attempt_at: startedAtIso,
    last_success_at: allFailed ? undefined : finishedAtIso,
    message: summary,
  });

  // A mesma rotina também pode ser chamada pela rota protegida de sync; por
  // isso a invalidação usa stale-while-revalidate em vez de updateTag.
  revalidateTag("campaigns", "max");
  revalidateTag("metrics", "max");
  revalidateTag("sync", "max");
  revalidatePath("/admin");
  revalidatePath("/admin/campanhas");
  revalidatePath("/admin/clientes");
  revalidatePath("/dashboard");

  if (allFailed) {
    throw new Error(summary);
  }

  return {
    campaignCount,
    metricCount,
    adLevelMetricCount,
    lastSuccessAt: finishedAtIso,
  } satisfies MetaSyncResult;
}

// Importa apenas as campanhas (sem métricas) de todas as contas ativas.
// Usado pelo botão "Importar campanhas" da tela de Campanhas.
export async function importAllMetaCampaigns() {
  const accounts = await getSyncableMetaAccounts();

  if (accounts.length === 0) {
    throw new Error(
      "Nenhuma conta de anúncio ativa. Cadastre ao menos uma conta em Configurações → Meta Ads.",
    );
  }

  let count = 0;
  const failures: string[] = [];

  for (const account of accounts) {
    try {
      count += await importMetaCampaigns(account);

      if (account.id) {
        await setMetaAccountSyncStatus(account.id, "ok", null);
      }
    } catch (error) {
      const detail = describeAccountError(error);
      failures.push(`${account.label}: ${detail}`);

      if (account.id) {
        await setMetaAccountSyncStatus(account.id, "error", detail);
      }
    }
  }

  revalidateTag("campaigns", "max");

  if (count === 0 && failures.length > 0) {
    throw new Error(failures.join(" | "));
  }

  return count;
}

export async function getMetaSyncStatus(): Promise<SyncStatus> {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return {
      provider: META_PROVIDER,
      status: "pending",
      lastAttemptAt: null,
      lastSuccessAt: null,
      message: "Supabase ainda não foi conectado para permitir a atualização manual.",
    };
  }

  const { data, error } = await adminClient
    .from("sync_statuses")
    .select("provider, status, last_attempt_at, last_success_at, message")
    .eq("provider", META_PROVIDER)
    .maybeSingle<{
      provider: IntegrationProvider;
      status: SyncStatus["status"];
      last_attempt_at: string | null;
      last_success_at: string | null;
      message: string | null;
    }>();

  if (error || !data) {
    return {
      provider: META_PROVIDER,
      status: "pending",
      lastAttemptAt: null,
      lastSuccessAt: null,
      message: "Nenhuma atualização manual foi executada ainda.",
    };
  }

  return {
    provider: data.provider,
    status: data.status,
    lastAttemptAt: data.last_attempt_at,
    lastSuccessAt: data.last_success_at,
    message: data.message,
  };
}
