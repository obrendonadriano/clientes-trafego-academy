import { unstable_cache } from "next/cache";
import { cache } from "react";
import { format, parseISO } from "date-fns";
import { getMockSnapshot } from "@/lib/mock-data";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type Embedded, firstEmbedded } from "@/lib/supabase/embedded";
import { getMetaSyncStatus } from "@/lib/sync/meta-sync";
import {
  formatMoney,
  getResultCategoryFromObjective,
  getResultLabelForCategory,
  resolveCurrency,
  type ResultCategory,
} from "@/lib/dashboard-metrics";
import {
  clampMetricsWindowForRole,
  type MetricsWindow,
} from "@/lib/data/date-range";
import {
  CampaignWithMetrics,
  Client,
  IntegrationSetting,
  RawCampaignMetric,
  ReportHistoryItem,
  SyncStatus,
  User,
} from "@/lib/types";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { withMetaTaxes } from "@/lib/taxes";

export const CACHE_TAGS = {
  users: "users",
  clients: "clients",
  campaigns: "campaigns",
  permissions: "permissions",
  metrics: "metrics",
  reports: "reports",
  sync: "sync",
} as const;

type DbUserRow = {
  id: string;
  auth_user_id: string | null;
  nome: string;
  username: string;
  email: string;
  role: "admin" | "client";
  whatsapp: string | null;
  ativo: boolean;
  client_id: string | null;
  clients?: Embedded<{
    nome_empresa: string;
  }>;
};

type DbClientRow = {
  id: string;
  nome_empresa: string;
  responsavel: string;
  whatsapp: string | null;
  observacoes: string | null;
  segmento?: string | null;
  segmento_descricao?: string | null;
  ativo: boolean;
};

type DbClientCampaignCodeRow = {
  client_id: string | null;
  code: string;
};

type DbCampaignRow = {
  id: string;
  nome: string;
  status: string;
  plataforma: string;
  client_id: string | null;
  objective: string | null;
  clients?: Embedded<{
    nome_empresa: string;
  }>;
};

type DbPermissionRow = {
  user_id: string;
  campaign_id: string;
};

type DbMetricRow = {
  campaign_id: string;
  date: string;
  granularity: "day" | "hour" | null;
  hour_bucket: number | null;
  hour_label: string | null;
  amount_spent: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  result_count: number | null;
  result_label: string | null;
  cpc: number;
  cpm: number;
  leads: number;
  cost_per_lead: number;
  roi: number;
  roas: number;
  frequency: number;
  currency: string | null;
  exchange_rate: number | null;
};

type DbIntegrationRow = {
  provider: string;
  enabled: boolean;
  config: Record<string, string> | null;
};

type DbReportRow = {
  id: string;
  client_id: string | null;
  period_start: string | null;
  period_end: string | null;
  generated_text: string;
  created_at: string;
  clients?: Embedded<{
    nome_empresa: string;
    whatsapp: string | null;
  }>;
};

type DbSyncStatusRow = {
  provider: "meta_ads" | "gemini" | "supabase";
  status: SyncStatus["status"];
  last_attempt_at: string | null;
  last_success_at: string | null;
  message: string | null;
};

// Campanha sem métricas agregadas — forma serializável usada pelo cache.
export type CampaignBase = {
  id: string;
  name: string;
  status: "Ativa" | "Pausada";
  platform: string;
  clientId: string | null;
  clientName?: string;
  resultCategory: ResultCategory;
};

function formatReportPeriodLabel(periodStart: string | null, periodEnd: string | null) {
  if (!periodStart || !periodEnd) {
    return "Período não informado";
  }

  try {
    return `${format(parseISO(periodStart), "dd/MM/yyyy")} a ${format(parseISO(periodEnd), "dd/MM/yyyy")}`;
  } catch {
    return "Período não informado";
  }
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mapUser(row: DbUserRow): User {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    name: row.nome,
    username: row.username,
    email: row.email,
    role: row.role,
    whatsapp: row.whatsapp ?? "",
    active: row.ativo,
    clientId: row.client_id,
    clientName: firstEmbedded(row.clients)?.nome_empresa,
  };
}

function mapClient(row: DbClientRow, campaignCode?: string): Client {
  return {
    id: row.id,
    companyName: row.nome_empresa,
    contactName: row.responsavel,
    whatsapp: row.whatsapp ?? "",
    notes: row.observacoes ?? "",
    active: row.ativo,
    campaignCode,
    segment: row.segmento ?? undefined,
    segmentDescription: row.segmento_descricao ?? undefined,
  };
}

function mapCampaignBase(row: DbCampaignRow): CampaignBase {
  return {
    id: row.id,
    name: row.nome,
    status: row.status === "Ativa" ? "Ativa" : "Pausada",
    platform: row.plataforma,
    clientId: row.client_id,
    clientName: firstEmbedded(row.clients)?.nome_empresa,
    resultCategory: getResultCategoryFromObjective(row.objective),
  };
}

function mapReport(row: DbReportRow): ReportHistoryItem {
  return {
    id: row.id,
    clientId: row.client_id ?? undefined,
    clientName: firstEmbedded(row.clients)?.nome_empresa ?? "Cliente removido",
    whatsapp: firstEmbedded(row.clients)?.whatsapp ?? "",
    periodLabel: formatReportPeriodLabel(row.period_start, row.period_end),
    preview:
      row.generated_text.length > 160
        ? `${row.generated_text.slice(0, 160)}…`
        : row.generated_text,
    generatedText: row.generated_text,
    createdAt: row.created_at,
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function mapMetricRow(row: DbMetricRow): RawCampaignMetric {
  return {
    campaignId: row.campaign_id,
    date: row.date,
    granularity: row.granularity === "hour" ? "hour" : "day",
    hourBucket: row.hour_bucket ?? -1,
    hourLabel: row.hour_label ?? "",
    amountSpent: toNumber(row.amount_spent),
    reach: toNumber(row.reach),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    ctr: toNumber(row.ctr),
    results: toNumber(row.result_count ?? row.leads),
    resultLabel: row.result_label ?? "Leads no site",
    cpc: toNumber(row.cpc),
    cpm: toNumber(row.cpm),
    leads: toNumber(row.leads),
    costPerLead: toNumber(row.cost_per_lead),
    roi: toNumber(row.roi),
    roas: toNumber(row.roas),
    frequency: toNumber(row.frequency),
    currency: (row.currency ?? "BRL").toUpperCase(),
    exchangeRate: row.exchange_rate && row.exchange_rate > 0 ? Number(row.exchange_rate) : 1,
  };
}

type AggregatedMetric = {
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
  currency: string;
  amount_spent_original: number;
  cpc_original: number;
  cpm_original: number;
  cost_per_lead_original: number;
};

function aggregateMetrics(rows: RawCampaignMetric[]): AggregatedMetric | undefined {
  if (rows.length === 0) {
    return undefined;
  }

  const rowsByDate = new Map<string, RawCampaignMetric[]>();

  for (const row of rows) {
    const items = rowsByDate.get(row.date) ?? [];
    items.push(row);
    rowsByDate.set(row.date, items);
  }

  const normalizedRows = Array.from(rowsByDate.values()).flatMap((items) => {
    const dailyRows = items.filter((item) => item.granularity === "day");
    return dailyRows.length > 0 ? dailyRows : items;
  });

  const totals = normalizedRows.reduce(
    (acc, row) => {
      acc.amount_spent += row.amountSpent;
      acc.amount_spent_original +=
        row.exchangeRate && row.exchangeRate > 0
          ? row.amountSpent / row.exchangeRate
          : row.amountSpent;
      acc.reach += row.reach;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.results += row.results;
      acc.leads += row.leads;
      acc.revenue += row.roas * row.amountSpent;
      acc.resultLabels.push(row.resultLabel);
      acc.roi.push(row.roi);
      acc.frequency.push(row.frequency);
      return acc;
    },
    {
      amount_spent: 0,
      amount_spent_original: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      leads: 0,
      revenue: 0,
      resultLabels: [] as string[],
      roi: [] as number[],
      frequency: [] as number[],
    },
  );

  return {
    amount_spent: totals.amount_spent,
    reach: totals.reach,
    impressions: totals.impressions,
    clicks: totals.clicks,
    ctr:
      totals.impressions > 0
        ? (totals.clicks / totals.impressions) * 100
        : 0,
    result_count: totals.results,
    result_label: totals.resultLabels[0] ?? "Leads no site",
    cpc: totals.clicks > 0 ? totals.amount_spent / totals.clicks : 0,
    cpm:
      totals.impressions > 0
        ? (totals.amount_spent / totals.impressions) * 1000
        : 0,
    leads: totals.leads,
    // Custo por RESULTADO = gasto / resultado principal (bate com a Meta).
    cost_per_lead:
      totals.results > 0 ? totals.amount_spent / totals.results : 0,
    roi: average(totals.roi),
    // ROAS ponderado pelo gasto (receita / investimento), como a Meta calcula.
    roas: totals.amount_spent > 0 ? totals.revenue / totals.amount_spent : 0,
    frequency: average(totals.frequency),
    currency: resolveCurrency(normalizedRows),
    amount_spent_original: totals.amount_spent_original,
    cpc_original: totals.clicks > 0 ? totals.amount_spent_original / totals.clicks : 0,
    cpm_original:
      totals.impressions > 0
        ? (totals.amount_spent_original / totals.impressions) * 1000
        : 0,
    cost_per_lead_original:
      totals.results > 0 ? totals.amount_spent_original / totals.results : 0,
  };
}

function toCampaignWithMetrics(
  base: CampaignBase,
  metric?: AggregatedMetric,
): CampaignWithMetrics {
  const currency = metric?.currency ?? "BRL";
  const isForeign = currency !== "BRL";
  // Rótulo do resultado vem da categoria (objetivo da campanha).
  const categoryLabel = getResultLabelForCategory(base.resultCategory);

  return {
    ...base,
    metrics: {
      // Investido exibido COM os impostos da Meta; CPC/CPM/custo por
      // resultado continuam sobre a veiculação pura (batem com a Meta).
      amountSpent: formatCurrency(withMetaTaxes(metric?.amount_spent ?? 0)),
      reach: String(metric?.reach ?? 0),
      impressions: String(metric?.impressions ?? 0),
      clicks: String(metric?.clicks ?? 0),
      ctr: `${(metric?.ctr ?? 0).toFixed(2)}%`,
      results: String(metric?.result_count ?? metric?.leads ?? 0),
      resultLabel: metric?.result_label ?? categoryLabel,
      cpc: formatCurrency(metric?.cpc ?? 0),
      cpm: formatCurrency(metric?.cpm ?? 0),
      leads: String(metric?.leads ?? 0),
      costPerLead: formatCurrency(metric?.cost_per_lead ?? 0),
      roi: `${(metric?.roi ?? 0).toFixed(2)}%`,
      roas: `${(metric?.roas ?? 0).toFixed(2)}x`,
      frequency: (metric?.frequency ?? 0).toFixed(2),
      periodLabel: metric ? "Última sincronização" : "Aguardando importação",
      currency,
      amountSpentOriginal:
        isForeign && metric
          ? formatMoney(withMetaTaxes(metric.amount_spent_original), currency)
          : undefined,
      cpcOriginal: isForeign && metric ? formatMoney(metric.cpc_original, currency) : undefined,
      cpmOriginal: isForeign && metric ? formatMoney(metric.cpm_original, currency) : undefined,
      costPerLeadOriginal:
        isForeign && metric ? formatMoney(metric.cost_per_lead_original, currency) : undefined,
    },
  };
}

function withWindowMetrics(
  bases: CampaignBase[],
  metricRows: RawCampaignMetric[],
): CampaignWithMetrics[] {
  const rowsByCampaign = new Map<string, RawCampaignMetric[]>();

  for (const row of metricRows) {
    const items = rowsByCampaign.get(row.campaignId) ?? [];
    items.push(row);
    rowsByCampaign.set(row.campaignId, items);
  }

  return bases.map((base) =>
    toCampaignWithMetrics(base, aggregateMetrics(rowsByCampaign.get(base.id) ?? [])),
  );
}

function requireAdminClient() {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase service role não configurado.");
  }

  return adminClient;
}

// ---------------------------------------------------------------------------
// Primitivas cacheadas (unstable_cache + tags). Nada aqui pode ler cookies.
// As actions e o sync invalidam via revalidateTag(CACHE_TAGS.*).
// ---------------------------------------------------------------------------

const fetchUsersCached = unstable_cache(
  async () => {
    const { data, error } = await requireAdminClient()
      .from("users")
      .select(
        "id, auth_user_id, nome, username, email, role, whatsapp, ativo, client_id, clients(nome_empresa)",
      )
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return ((data as DbUserRow[] | null) ?? []).map(mapUser);
  },
  ["users"],
  { tags: [CACHE_TAGS.users], revalidate: 300 },
);

const fetchClientsCached = unstable_cache(
  async () => {
    const admin = requireAdminClient();
    const baseColumns = "id, nome_empresa, responsavel, whatsapp, observacoes, ativo";

    // Tenta com as colunas de segmento; se ainda não existirem (migração não
    // aplicada), refaz sem elas para não derrubar o painel.
    const withSegments = await admin
      .from("clients")
      .select(`${baseColumns}, segmento, segmento_descricao`)
      .order("created_at", { ascending: true });

    let rows = withSegments.data as DbClientRow[] | null;
    let error = withSegments.error;

    if (error && /segmento/i.test(error.message)) {
      const fallback = await admin
        .from("clients")
        .select(baseColumns)
        .order("created_at", { ascending: true });
      rows = fallback.data as DbClientRow[] | null;
      error = fallback.error;
    }

    if (error) {
      throw new Error(error.message);
    }

    // Compatibilidade durante o deploy: o painel continua carregando mesmo
    // antes de a migracao dos codigos ser aplicada. Depois dela, o codigo e
    // incorporado ao mesmo objeto de cliente usado em todas as telas.
    const codeResult = await admin
      .from("client_campaign_codes")
      .select("client_id, code")
      .eq("status", "active");
    const codeByClientId = new Map(
      ((codeResult.data as DbClientCampaignCodeRow[] | null) ?? [])
        .filter((item) => item.client_id)
        .map((item) => [item.client_id as string, item.code] as const),
    );

    return (rows ?? []).map((row) => mapClient(row, codeByClientId.get(row.id)));
  },
  ["clients"],
  { tags: [CACHE_TAGS.clients], revalidate: 300 },
);

const fetchCampaignBasesCached = unstable_cache(
  async () => {
    const { data, error } = await requireAdminClient()
      .from("campaigns")
      .select("id, nome, status, plataforma, client_id, objective, clients(nome_empresa)")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return ((data as DbCampaignRow[] | null) ?? []).map(mapCampaignBase);
  },
  ["campaigns"],
  { tags: [CACHE_TAGS.campaigns], revalidate: 300 },
);

const fetchPermissionsCached = unstable_cache(
  async () => {
    const { data, error } = await requireAdminClient()
      .from("user_campaign_permissions")
      .select("user_id, campaign_id");

    if (error) {
      throw new Error(error.message);
    }

    return ((data as DbPermissionRow[] | null) ?? []).map((item) => ({
      userId: item.user_id,
      campaignId: item.campaign_id,
    }));
  },
  ["permissions"],
  { tags: [CACHE_TAGS.permissions], revalidate: 300 },
);

// Janela de métricas filtrada NO BANCO por data, granularidade e (opcional)
// campanhas.
//
// IMPORTANTE: aqui NÃO se usa `unstable_cache`. O resultado de uma janela
// grande passa de 8 MB e o cache de dados do Next recusa qualquer item acima
// de 2 MB — a gravação falha de forma assíncrona, vira `unhandledRejection` e
// o processo do servidor MORRE (Node 22 encerra o processo nesse caso). Era o
// que derrubava o servidor ao abrir /admin/campanhas.
//
// `cache()` do React deduplica a mesma consulta dentro de um request (várias
// seções da página pedem a mesma janela) sem tentar persistir nada em disco.
const fetchMetricsWindowCached = cache(
  async (
    startDate: string,
    endDate: string,
    campaignKey: string | null,
    includeHourly: boolean,
  ): Promise<RawCampaignMetric[]> => {
    const campaignIds = campaignKey ? campaignKey.split(",") : null;
    const adminClient = requireAdminClient();
    const pageSize = 1000;

    const columns =
      "campaign_id, date, granularity, hour_bucket, hour_label, amount_spent, reach, impressions, clicks, ctr, result_count, result_label, cpc, cpm, leads, cost_per_lead, roi, roas, frequency, currency, exchange_rate";

    async function fetchAll(granularity: "day" | "hour", from: string) {
      const rows: DbMetricRow[] = [];
      let offset = 0;

      while (true) {
        let query = adminClient
          .from("campaign_metrics")
          .select(columns)
          .eq("granularity", granularity)
          .gte("date", from)
          .lte("date", endDate);

        if (campaignIds) {
          query = query.in("campaign_id", campaignIds);
        }

        const { data, error } = await query
          .order("date", { ascending: true })
          .order("campaign_id", { ascending: true })
          .order("hour_bucket", { ascending: true, nullsFirst: true })
          .range(offset, offset + pageSize - 1);

        if (error) {
          throw new Error(error.message);
        }

        const batch = (data as DbMetricRow[] | null) ?? [];
        rows.push(...batch);

        if (batch.length < pageSize) {
          return rows;
        }

        offset += pageSize;
      }
    }

    // As linhas hora-a-hora só são usadas nos períodos "Hoje" e "Ontem" — para
    // qualquer janela maior o código prefere as diárias e descarta as horárias.
    // Como elas são ~95% da tabela, buscá-las inteiras era o que deixava as
    // páginas em mais de 10s. Aqui vêm apenas os últimos dias da janela.
    const hourlyFrom = maxIsoDay(startDate, addIsoDays(endDate, -HOURLY_DAYS));

    const [dailyRows, hourlyRows] = await Promise.all([
      fetchAll("day", startDate),
      includeHourly
        ? fetchAll("hour", hourlyFrom)
        : Promise.resolve([] as DbMetricRow[]),
    ]);

    return [...dailyRows, ...hourlyRows].map(mapMetricRow);
  },
);

// Quantos dias no fim da janela trazem também a granularidade horária.
const HOURLY_DAYS = 2;

function addIsoDays(day: string, amount: number) {
  const date = parseISO(day);
  date.setDate(date.getDate() + amount);
  return format(date, "yyyy-MM-dd");
}

function maxIsoDay(a: string, b: string) {
  return a > b ? a : b;
}

const fetchReportsCached = unstable_cache(
  async (clientId: string | null) => {
    let query = requireAdminClient()
      .from("ai_reports")
      .select(
        "id, client_id, period_start, period_end, generated_text, created_at, clients(nome_empresa, whatsapp)",
      )
      .order("created_at", { ascending: false })
      .limit(10);

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return ((data as DbReportRow[] | null) ?? []).map(mapReport);
  },
  ["reports"],
  { tags: [CACHE_TAGS.reports], revalidate: 300 },
);

const fetchSyncStatusesCached = unstable_cache(
  async (): Promise<SyncStatus[]> => {
    const { data, error } = await requireAdminClient()
      .from("sync_statuses")
      .select(
        "provider, status, last_attempt_at, last_success_at, message",
      );

    if (error || !data || data.length === 0) {
      return [await getMetaSyncStatus()];
    }

    return (data as DbSyncStatusRow[]).map((row) => ({
      provider: row.provider,
      status: row.status,
      lastAttemptAt: row.last_attempt_at,
      lastSuccessAt: row.last_success_at,
      message: row.message,
    }));
  },
  ["sync-statuses"],
  { tags: [CACHE_TAGS.sync], revalidate: 60 },
);

function fetchMetricsWindow(window: MetricsWindow, campaignIds?: string[]) {
  if (campaignIds && campaignIds.length === 0) {
    return Promise.resolve([] as RawCampaignMetric[]);
  }

  // A lista ordenada e serializada mantém a dedupe do React.cache estável
  // entre chamadas que pedem exatamente as mesmas campanhas.
  return fetchMetricsWindowCached(
    window.startDate,
    window.endDate,
    campaignIds ? [...campaignIds].sort().join(",") : null,
    window.includeHourly === true,
  );
}

// ---------------------------------------------------------------------------
// Funções por página
// ---------------------------------------------------------------------------

export type AdminOverviewData = {
  clientCount: number;
  activeClientCount: number;
  campaignCount: number;
  activeCampaignCount: number;
  clientUserCount: number;
  permissionCount: number;
  metricRows: RawCampaignMetric[];
};

// `clientId` vem do seletor de cliente da topbar (?cliente=). Quando presente,
// os contadores e as metricas passam a considerar so aquele cliente.
export async function getAdminOverviewData(
  window: MetricsWindow,
  clientId?: string | null,
): Promise<AdminOverviewData> {
  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    const allowed = clientId ? await getCampaignIdsForClient(clientId) : null;
    const campaigns = allowed
      ? snapshot.campaigns.filter((campaign) => allowed.has(campaign.id))
      : snapshot.campaigns;
    const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
    const users = snapshot.users.filter(
      (user) => user.role === "client" && (!clientId || user.clientId === clientId),
    );
    const userIds = new Set(users.map((user) => user.id));

    return {
      clientCount: clientId ? 1 : snapshot.clients.length,
      activeClientCount: snapshot.clients.filter(
        (client) => client.active && (!clientId || client.id === clientId),
      ).length,
      campaignCount: campaigns.length,
      activeCampaignCount: campaigns.filter(
        (campaign) => campaign.status === "Ativa",
      ).length,
      clientUserCount: users.length,
      permissionCount: snapshot.permissions.filter(
        (permission) => !clientId || userIds.has(permission.userId),
      ).length,
      metricRows: clientId
        ? snapshot.metricRows.filter((row) => campaignIds.has(row.campaignId))
        : snapshot.metricRows,
    };
  }

  const [clients, allCampaigns, allUsers, permissions] = await Promise.all([
    fetchClientsCached(),
    fetchCampaignBasesCached(),
    fetchUsersCached(),
    fetchPermissionsCached(),
  ]);

  const clientCampaignIds = clientId
    ? await getCampaignIdsForClient(clientId)
    : null;
  const campaigns = clientCampaignIds
    ? allCampaigns.filter((campaign) => clientCampaignIds.has(campaign.id))
    : allCampaigns;
  const users = allUsers.filter(
    (user) => user.role === "client" && (!clientId || user.clientId === clientId),
  );
  const userIds = new Set(users.map((user) => user.id));

  // Com cliente selecionado, so as metricas das campanhas dele sao buscadas.
  const metricRows = await fetchMetricsWindow(
    window,
    clientId ? campaigns.map((campaign) => campaign.id) : undefined,
  );

  return {
    clientCount: clientId ? 1 : clients.length,
    activeClientCount: clients.filter(
      (client) => client.active && (!clientId || client.id === clientId),
    ).length,
    campaignCount: campaigns.length,
    activeCampaignCount: campaigns.filter((campaign) => campaign.status === "Ativa")
      .length,
    clientUserCount: users.length,
    permissionCount: permissions.filter(
      (permission) => !clientId || userIds.has(permission.userId),
    ).length,
    metricRows,
  };
}

export async function getAdminCampaignsData(
  window: MetricsWindow,
  clientId?: string | null,
) {
  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    const allowed = clientId ? await getCampaignIdsForClient(clientId) : null;
    const campaigns = allowed
      ? snapshot.campaigns.filter((campaign) => allowed.has(campaign.id))
      : snapshot.campaigns;
    const campaignIds = new Set(campaigns.map((campaign) => campaign.id));

    return {
      campaigns,
      metricRows: clientId
        ? snapshot.metricRows.filter((row) => campaignIds.has(row.campaignId))
        : snapshot.metricRows,
    };
  }

  const allBases = await fetchCampaignBasesCached();
  const allowed = clientId ? await getCampaignIdsForClient(clientId) : null;
  const bases = allowed
    ? allBases.filter((base) => allowed.has(base.id))
    : allBases;
  const metricRows = await fetchMetricsWindow(
    window,
    clientId ? bases.map((base) => base.id) : undefined,
  );

  return {
    campaigns: withWindowMetrics(bases, metricRows),
    metricRows,
  };
}

// A página de Clientes é só criar/editar: nenhuma métrica é carregada aqui.
export async function getAdminClientsListData() {
  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    return {
      clients: snapshot.clients,
      campaigns: snapshot.campaigns,
      permissions: snapshot.permissions,
      clientUsers: snapshot.users.filter((user) => user.role === "client"),
    };
  }

  const [clients, bases, permissions, users] = await Promise.all([
    fetchClientsCached(),
    fetchCampaignBasesCached(),
    fetchPermissionsCached(),
    fetchUsersCached(),
  ]);

  return {
    clients,
    campaigns: bases.map((base) => toCampaignWithMetrics(base)),
    permissions,
    clientUsers: users.filter((user) => user.role === "client"),
  };
}

export async function getAdminClientProfileData(
  clientId: string,
  window: MetricsWindow,
) {
  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    const client = snapshot.clients.find((item) => item.id === clientId);

    if (!client) {
      return null;
    }

    const linkedUser =
      snapshot.users.find(
        (user) => user.role === "client" && user.clientId === client.id,
      ) ?? null;
    const selectedCampaignIds = linkedUser
      ? snapshot.permissions
          .filter((permission) => permission.userId === linkedUser.id)
          .map((permission) => permission.campaignId)
      : [];
    const automaticCampaignIds = snapshot.campaigns
      .filter((campaign) => campaign.clientId === client.id)
      .map((campaign) => campaign.id);
    const allowedCampaignIds = Array.from(
      new Set([...selectedCampaignIds, ...automaticCampaignIds]),
    );

    return {
      client,
      linkedUser,
      selectedCampaignIds,
      automaticCampaignIds,
      allowedCampaigns: snapshot.campaigns.filter((campaign) =>
        allowedCampaignIds.includes(campaign.id),
      ),
      allCampaigns: snapshot.campaigns,
      metricRows: snapshot.metricRows.filter((row) =>
        allowedCampaignIds.includes(row.campaignId),
      ),
    };
  }

  const [clients, users, permissions, bases] = await Promise.all([
    fetchClientsCached(),
    fetchUsersCached(),
    fetchPermissionsCached(),
    fetchCampaignBasesCached(),
  ]);

  const client = clients.find((item) => item.id === clientId);

  if (!client) {
    return null;
  }

  const linkedUser =
    users.find((user) => user.role === "client" && user.clientId === client.id) ??
    null;

  const selectedCampaignIds = linkedUser
    ? permissions
        .filter((permission) => permission.userId === linkedUser.id)
        .map((permission) => permission.campaignId)
    : [];
  const automaticCampaignIds = bases
    .filter((campaign) => campaign.clientId === client.id)
    .map((campaign) => campaign.id);
  const allowedCampaignIds = Array.from(
    new Set([...selectedCampaignIds, ...automaticCampaignIds]),
  );

  const metricRows = await fetchMetricsWindow(window, allowedCampaignIds);
  const allCampaigns = withWindowMetrics(bases, metricRows);

  return {
    client,
    linkedUser,
    selectedCampaignIds,
    automaticCampaignIds,
    allowedCampaigns: allCampaigns.filter((campaign) =>
      allowedCampaignIds.includes(campaign.id),
    ),
    allCampaigns,
    metricRows,
  };
}

export async function getCampaignIdsForUser(user: User): Promise<Set<string>> {
  if (user.role !== "client") {
    return new Set();
  }

  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    const allowedIds = new Set(
      snapshot.permissions
        .filter((permission) => permission.userId === user.id)
        .map((permission) => permission.campaignId),
    );

    if (user.clientId) {
      for (const campaign of snapshot.campaigns) {
        if (campaign.clientId === user.clientId) {
          allowedIds.add(campaign.id);
        }
      }
    }

    return allowedIds;
  }

  const [permissions, campaigns] = await Promise.all([
    fetchPermissionsCached(),
    fetchCampaignBasesCached(),
  ]);
  const allowedIds = new Set(
    permissions
      .filter((permission) => permission.userId === user.id)
      .map((permission) => permission.campaignId),
  );

  if (user.clientId) {
    for (const campaign of campaigns) {
      if (campaign.clientId === user.clientId) {
        allowedIds.add(campaign.id);
      }
    }
  }

  return allowedIds;
}

export async function getClientPortalData(user: User, window: MetricsWindow) {
  // Validação de backend: cliente nunca recebe mais que 3 meses,
  // independentemente do que vier da UI ou da URL.
  const safeWindow = clampMetricsWindowForRole(user.role, window);

  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    const allowedIds = await getCampaignIdsForUser(user);
    const campaigns = snapshot.campaigns.filter((campaign) =>
      allowedIds.has(campaign.id),
    );

    return {
      campaigns,
      metricRows: snapshot.metricRows.filter((row) => allowedIds.has(row.campaignId)),
      syncStatus:
        snapshot.syncStatuses.find((status) => status.provider === "meta_ads") ??
        null,
    };
  }

  const [allowedIdSet, bases, syncStatuses] = await Promise.all([
    getCampaignIdsForUser(user),
    fetchCampaignBasesCached(),
    fetchSyncStatusesCached(),
  ]);

  const allowedIds = [...allowedIdSet];

  const metricRows = await fetchMetricsWindow(safeWindow, allowedIds);

  return {
    campaigns: withWindowMetrics(
      bases.filter((base) => allowedIdSet.has(base.id)),
      metricRows,
    ),
    metricRows,
    syncStatus:
      syncStatuses.find((status) => status.provider === "meta_ads") ?? null,
  };
}

export async function getReportsPageData() {
  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    return {
      clients: snapshot.clients,
      campaigns: snapshot.campaigns,
      clientUsers: snapshot.users.filter((user) => user.role === "client"),
      permissions: snapshot.permissions,
      reports: snapshot.reports,
    };
  }

  const [clients, bases, users, permissions, reports] = await Promise.all([
    fetchClientsCached(),
    fetchCampaignBasesCached(),
    fetchUsersCached(),
    fetchPermissionsCached(),
    fetchReportsCached(null),
  ]);

  return {
    clients,
    // O painel de relatórios só precisa de nome/cliente das campanhas.
    campaigns: bases.map((base) => toCampaignWithMetrics(base)),
    clientUsers: users.filter((user) => user.role === "client"),
    permissions,
    reports,
  };
}

// Dados para a action de geração de relatório IA: busca direcionada por
// cliente/campanhas e métricas do range exato (filtrado no banco).
export async function getReportGenerationData(input: {
  clientId: string;
  campaignIds: string[];
  window: MetricsWindow;
}) {
  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    const client =
      snapshot.clients.find((item) => item.id === input.clientId) ?? null;
    const campaigns = snapshot.campaigns.filter((campaign) =>
      input.campaignIds.includes(campaign.id),
    );

    return {
      client,
      campaigns,
      metricRows: snapshot.metricRows.filter((row) =>
        input.campaignIds.includes(row.campaignId),
      ),
    };
  }

  const [clients, bases] = await Promise.all([
    fetchClientsCached(),
    fetchCampaignBasesCached(),
  ]);

  const client = clients.find((item) => item.id === input.clientId) ?? null;
  const campaigns = bases.filter((base) => input.campaignIds.includes(base.id));
  const metricRows = await fetchMetricsWindow(
    input.window,
    campaigns.map((campaign) => campaign.id),
  );

  return {
    client,
    campaigns: campaigns.map((base) => toCampaignWithMetrics(base)),
    metricRows,
  };
}

function getDefaultIntegrations(): IntegrationSetting[] {
  return [
    {
      provider: "supabase",
      enabled: Boolean(getSupabaseUrl() && getSupabasePublishableKey()),
      status:
        getSupabaseUrl() && getSupabasePublishableKey()
          ? "connected"
          : "not_configured",
      title: "Supabase",
      description: "Base do sistema, autenticação e persistência principal.",
      config: {
        projectUrl: getSupabaseUrl() ?? "",
      },
    },
    {
      provider: "meta_ads",
      enabled: false,
      status: "pending",
      title: "Meta Ads",
      description: "Conexão com campanhas e métricas via app do Meta for Developers.",
      config: {},
    },
    {
      provider: "gemini",
      enabled: Boolean(process.env.GEMINI_API_KEY),
      status: process.env.GEMINI_API_KEY ? "connected" : "pending",
      title: "Gemini",
      description: "Geração de análises consultivas e relatórios para clientes.",
      config: {},
    },
  ];
}

// Resolve as campanhas de um cliente. O vinculo NAO vem de campaigns.client_id
// (o import da Meta nao preenche esse campo) e sim das permissoes do usuario
// vinculado ao cliente — a mesma regra do portal do cliente. Ainda assim, se
// alguma campanha tiver client_id preenchido manualmente, ela tambem entra.
export async function getCampaignIdsForClient(
  clientId: string,
): Promise<Set<string>> {
  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    const users = snapshot.users.filter(
      (user) => user.role === "client" && user.clientId === clientId,
    );
    const userIds = new Set(users.map((user) => user.id));

    return new Set([
      ...snapshot.permissions
        .filter((permission) => userIds.has(permission.userId))
        .map((permission) => permission.campaignId),
      ...snapshot.campaigns
        .filter((campaign) => campaign.clientId === clientId)
        .map((campaign) => campaign.id),
    ]);
  }

  const [users, permissions, bases] = await Promise.all([
    fetchUsersCached(),
    fetchPermissionsCached(),
    fetchCampaignBasesCached(),
  ]);

  const userIds = new Set(
    users
      .filter((user) => user.role === "client" && user.clientId === clientId)
      .map((user) => user.id),
  );

  return new Set([
    ...permissions
      .filter((permission) => userIds.has(permission.userId))
      .map((permission) => permission.campaignId),
    ...bases
      .filter((base) => base.clientId === clientId)
      .map((base) => base.id),
  ]);
}

// Fonte do fechamento: campanhas + metricas da janela EXATA pedida (sem a
// uniao com a janela padrao que as paginas usam). Respeita o papel: admin ve
// tudo (ou so o cliente selecionado), cliente ve apenas o que foi liberado.
export async function getClosingSourceData(
  user: User,
  window: MetricsWindow,
  clientId?: string | null,
): Promise<{
  clientName: string;
  campaigns: CampaignWithMetrics[];
  metricRows: RawCampaignMetric[];
  // Quando a Meta foi lida pela ultima vez. O fechamento usa para avisar que
  // o periodo pode estar incompleto.
  syncedAt: string | null;
}> {
  if (user.role !== "admin") {
    const portal = await getClientPortalData(user, window);
    // getClientPortalData carrega a janela pedida e ja filtra por permissao.
    const allowedIds = new Set(portal.campaigns.map((campaign) => campaign.id));

    return {
      clientName: user.clientName ?? user.name,
      campaigns: portal.campaigns,
      metricRows: portal.metricRows.filter((row) => allowedIds.has(row.campaignId)),
      syncedAt: portal.syncStatus?.lastSuccessAt ?? null,
    };
  }

  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    const allowed = clientId ? await getCampaignIdsForClient(clientId) : null;
    const campaigns = allowed
      ? snapshot.campaigns.filter((campaign) => allowed.has(campaign.id))
      : snapshot.campaigns;
    const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
    const client = clientId
      ? snapshot.clients.find((item) => item.id === clientId)
      : undefined;

    return {
      clientName: client?.companyName ?? "Todos os clientes",
      campaigns,
      metricRows: snapshot.metricRows.filter(
        (row) =>
          campaignIds.has(row.campaignId) &&
          row.date >= window.startDate &&
          row.date <= window.endDate,
      ),
      syncedAt:
        snapshot.syncStatuses.find((status) => status.provider === "meta_ads")
          ?.lastSuccessAt ?? null,
    };
  }

  const [clients, allBases, syncStatuses] = await Promise.all([
    fetchClientsCached(),
    fetchCampaignBasesCached(),
    fetchSyncStatusesCached(),
  ]);

  const allowedIds = clientId ? await getCampaignIdsForClient(clientId) : null;
  const bases = allowedIds
    ? allBases.filter((base) => allowedIds.has(base.id))
    : allBases;
  const metricRows = await fetchMetricsWindow(
    window,
    clientId ? bases.map((base) => base.id) : undefined,
  );

  const client = clientId
    ? clients.find((item) => item.id === clientId)
    : undefined;

  return {
    clientName: client?.companyName ?? "Todos os clientes",
    campaigns: withWindowMetrics(bases, metricRows),
    metricRows,
    syncedAt:
      syncStatuses.find((status) => status.provider === "meta_ads")
        ?.lastSuccessAt ?? null,
  };
}

// Dados leves da moldura (topbar): seletor de cliente, busca e selo de sync.
// Nao carrega metricas — roda em toda navegacao das areas logadas.
export type AppShellData = {
  clients: { id: string; name: string }[];
  campaigns: { id: string; name: string; clientName?: string }[];
  syncStatus: SyncStatus | null;
};

export async function getAppShellData(user: User): Promise<AppShellData> {
  if (user.role !== "admin") {
    const { syncStatus } = await getClientPortalShellData(user);
    return { clients: [], campaigns: [], syncStatus };
  }

  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    return {
      clients: snapshot.clients.map((client) => ({
        id: client.id,
        name: client.companyName,
      })),
      campaigns: snapshot.campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        clientName: campaign.clientName,
      })),
      syncStatus:
        snapshot.syncStatuses.find((status) => status.provider === "meta_ads") ?? null,
    };
  }

  const [clients, bases, syncStatuses] = await Promise.all([
    fetchClientsCached(),
    fetchCampaignBasesCached(),
    fetchSyncStatusesCached(),
  ]);

  return {
    clients: clients.map((client) => ({ id: client.id, name: client.companyName })),
    campaigns: bases.map((base) => ({
      id: base.id,
      name: base.name,
      clientName: base.clientName,
    })),
    syncStatus:
      syncStatuses.find((status) => status.provider === "meta_ads") ?? null,
  };
}

// So o selo de sync para o portal do cliente (sem lista de clientes).
async function getClientPortalShellData(user: User) {
  void user;

  if (!isSupabaseAdminConfigured()) {
    const snapshot = getMockSnapshot();
    return {
      syncStatus:
        snapshot.syncStatuses.find((status) => status.provider === "meta_ads") ?? null,
    };
  }

  const syncStatuses = await fetchSyncStatusesCached();
  return {
    syncStatus:
      syncStatuses.find((status) => status.provider === "meta_ads") ?? null,
  };
}

export async function getIntegrationSettings() {
  const defaults = getDefaultIntegrations();
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return defaults;
  }

  const { data, error } = await adminClient
    .from("integration_settings")
    .select("provider, enabled, config");

  if (error || !data) {
    return defaults;
  }

  const map = new Map(
    (data as DbIntegrationRow[]).map((item) => [item.provider, item]),
  );

  return defaults.map((item) => {
    const saved = map.get(item.provider);

    if (!saved) {
      return item;
    }

    return {
      ...item,
      enabled: saved.enabled,
      status: saved.enabled ? "connected" : "pending",
      config: {
        ...item.config,
        ...(saved.config ?? {}),
      },
    } satisfies IntegrationSetting;
  });
}
