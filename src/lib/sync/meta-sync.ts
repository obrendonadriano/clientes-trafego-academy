import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  fetchMetaCampaigns,
  fetchMetaInsights,
  getCurrencyRateToBrl,
  MetaPermissionError,
  MetaRateLimitError,
  MetaTokenExpiredError,
} from "@/lib/meta-ads";
import {
  getSyncableMetaAccounts,
  setMetaAccountSyncStatus,
  type ResolvedMetaAccount,
} from "@/lib/meta/accounts";
import {
  getResultActionTypesForCategory,
  getResultCategoryFromObjective,
  getResultLabelForCategory,
  type ResultCategory,
} from "@/lib/dashboard-metrics";
import { IntegrationProvider, SyncStatus } from "@/lib/types";

const META_SYNC_INTERVAL_MINUTES = 15;
const META_PROVIDER: IntegrationProvider = "meta_ads";

// Importante: client_id NÃO faz parte do payload de import — o upsert não
// pode sobrescrever o vínculo com cliente feito manualmente pelo admin.
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

type SyncStatusRow = {
  id: string;
  provider: string;
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

// Resultado principal definido pelo OBJETIVO da campanha (categoria). Para uma
// categoria conhecida (compra/lead/mensagem/tráfego), devolve a contagem dessa
// categoria mesmo que seja 0 — assim uma campanha de venda sem vendas mostra
// "Compras no site: 0", e não outra ação. Sem categoria → fallback: a ação de
// maior contagem.
function getPrimaryResult(
  actions: Array<{ action_type: string; value: string }> | undefined,
  category: ResultCategory,
) {
  const actionTypes = getResultActionTypesForCategory(category);

  if (actionTypes.length > 0) {
    // IMPORTANTE: NÃO somar os tipos — a Meta reporta a MESMA conversão em
    // vários action_types (purchase / omni_purchase / fb_pixel_purchase).
    // Pega o primeiro tipo com valor (o mais abrangente vem primeiro na lista),
    // evitando contar a mesma venda várias vezes.
    return {
      count: getPrioritizedActionValue(actions, actionTypes),
      label: getResultLabelForCategory(category),
    };
  }

  // Categoria sem ação específica (awareness/other) ou desconhecida: usa a ação
  // de maior contagem como aproximação.
  if (!actions || actions.length === 0) {
    return { count: 0, label: getResultLabelForCategory(category) };
  }

  const topAction = actions
    .map((item) => ({ type: item.action_type, value: Number(item.value || 0) }))
    .sort((a, b) => b.value - a.value)[0];

  if (!topAction || topAction.value <= 0) {
    return { count: 0, label: getResultLabelForCategory(category) };
  }

  return {
    count: topAction.value,
    label: topAction.type.replaceAll("_", " "),
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
  // ON CONFLICT só atualiza nome/status/plataforma/source e novas linhas
  // entram sem vínculo (o admin vincula ao cliente depois).
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

  const [
    last30DaysInsights,
    todayDailyInsights,
    todayHourlyInsights,
    yesterdayHourlyInsights,
  ] = await Promise.all([
    fetchMetaInsights({
      adAccountId: account.adAccountId,
      accessToken: account.accessToken,
      datePreset: "last_30d",
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
  const categoryByExternalId = new Map(
    (campaigns as CampaignLookupRow[])
      .filter((campaign) => campaign.external_id)
      .map((campaign) => [
        campaign.external_id as string,
        getResultCategoryFromObjective(campaign.objective),
      ]),
  );

  // Moeda da conta (a Meta informa por insight). Contas em moeda estrangeira
  // (ex.: USD) têm os valores convertidos para BRL pela cotação atual, para
  // que os clientes sempre vejam reais.
  const accountCurrency =
    last30DaysInsights.data.find((item) => item.account_currency)?.account_currency ??
    todayDailyInsights.data.find((item) => item.account_currency)?.account_currency ??
    todayHourlyInsights.data.find((item) => item.account_currency)?.account_currency ??
    "BRL";
  const currencyRate = await getCurrencyRateToBrl(accountCurrency);

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

      // Valores monetários convertidos para BRL (currencyRate = 1 quando a
      // conta já é em real). ROAS é uma razão e não muda com a moeda.
      const spend = Number(item.spend || 0) * currencyRate;

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
        cpc: Number(item.cpc || 0) * currencyRate,
        cpm: Number(item.cpm || 0) * currencyRate,
        leads: normalizedLeads,
        cost_per_lead: normalizedLeads > 0 ? spend / normalizedLeads : 0,
        roi: 0,
        roas,
        frequency: Number(item.frequency || 0),
        currency: (accountCurrency || "BRL").toUpperCase(),
        exchange_rate: currencyRate,
      };
    })
    .filter((row): row is MetricImportRow => Boolean(row));

  const uniqueRows = Array.from(
    new Map(
      rows.map((row) => [
        `${row.campaign_id}:${row.date}:${row.granularity}:${row.hour_bucket}`,
        row,
      ] as const),
    ).values(),
  );

  // Conta sem campanhas ativas ou sem dados no período não é erro — registra
  // zero métricas e segue (campanhas pausadas mantêm o histórico já salvo).
  if (uniqueRows.length === 0) {
    return 0;
  }

  await upsertMetricRows(uniqueRows);

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

  return error instanceof Error ? error.message : "Falha inesperada ao sincronizar a conta.";
}

export async function runMetaSync() {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();

  await persistSyncStatus({
    status: "running",
    last_attempt_at: startedAtIso,
    message: "Sincronização automática da Meta Ads em andamento.",
  });

  const accounts = await getSyncableMetaAccounts();

  if (accounts.length === 0) {
    const message =
      "Nenhuma conta de anúncio ativa. Cadastre ao menos uma conta em Configurações → Meta Ads.";
    const nextRunAt = getNextRunAt(new Date());

    await persistSyncStatus({
      status: "error",
      last_attempt_at: startedAtIso,
      next_run_at: nextRunAt,
      message,
    });
    revalidateTag("sync", "max");

    throw new Error(message);
  }

  let campaignCount = 0;
  let metricCount = 0;
  let okCount = 0;
  const failures: string[] = [];

  // Cada conta é sincronizada de forma isolada: um token expirado numa conta
  // não impede as outras de sincronizarem.
  for (const account of accounts) {
    try {
      campaignCount += await importMetaCampaigns(account);
      metricCount += await importMetaInsights(account);
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
  const nextRunAt = getNextRunAt(finishedAt);
  const allFailed = okCount === 0;

  const summary = allFailed
    ? `Falha ao sincronizar todas as contas. ${failures.join(" | ")}`
    : failures.length > 0
      ? `${okCount}/${accounts.length} conta(s) sincronizada(s): ${campaignCount} campanha(s) e ${metricCount} registro(s). Com erro: ${failures.join(" | ")}`
      : `Sincronização concluída: ${okCount} conta(s), ${campaignCount} campanha(s) e ${metricCount} registro(s) de métricas.`;

  await persistSyncStatus({
    status: allFailed ? "error" : "success",
    last_attempt_at: startedAtIso,
    last_success_at: allFailed ? undefined : finishedAtIso,
    next_run_at: nextRunAt,
    message: summary,
  });

  // "max" = stale-while-revalidate; obrigatório aqui porque o cron route
  // handler não pode chamar updateTag (restrito a Server Actions).
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
    lastSuccessAt: finishedAtIso,
    nextRunAt,
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
