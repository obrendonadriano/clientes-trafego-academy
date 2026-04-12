import { format, parseISO } from "date-fns";
import { getMockSnapshot } from "@/lib/mock-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMetaSyncStatus } from "@/lib/sync/meta-sync";
import {
  AppDataSnapshot,
  CampaignWithMetrics,
  Client,
  IntegrationSetting,
  RawCampaignMetric,
  SyncStatus,
  User,
} from "@/lib/types";
import { getReportHistory } from "@/lib/mock-data";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

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
  clients?: Array<{
    nome_empresa: string;
  }> | null;
};

type DbClientRow = {
  id: string;
  nome_empresa: string;
  responsavel: string;
  whatsapp: string | null;
  observacoes: string | null;
  ativo: boolean;
};

type DbCampaignRow = {
  id: string;
  nome: string;
  status: string;
  plataforma: string;
  client_id: string | null;
  clients?: Array<{
    nome_empresa: string;
  }> | null;
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
  clients?: Array<{
    nome_empresa: string;
    whatsapp: string | null;
  }> | null;
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

type DbSyncStatusRow = {
  provider: "meta_ads" | "gemini" | "supabase";
  interval_minutes: number;
  status: SyncStatus["status"];
  last_attempt_at: string | null;
  last_success_at: string | null;
  next_run_at: string | null;
  message: string | null;
};

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
    clientName: row.clients?.[0]?.nome_empresa,
  };
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function fetchAllMetricRows(adminClient: AdminClient) {
  const pageSize = 1000;
  const rows: DbMetricRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await adminClient
      .from("campaign_metrics")
      .select(
        "campaign_id, date, granularity, hour_bucket, hour_label, amount_spent, reach, impressions, clicks, ctr, result_count, result_label, cpc, cpm, leads, cost_per_lead, roi, roas, frequency",
      )
      .order("date", { ascending: true })
      .order("campaign_id", { ascending: true })
      .order("hour_bucket", { ascending: true, nullsFirst: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data as DbMetricRow[] | null) ?? [];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

function mapClient(row: DbClientRow): Client {
  return {
    id: row.id,
    companyName: row.nome_empresa,
    contactName: row.responsavel,
    whatsapp: row.whatsapp ?? "",
    notes: row.observacoes ?? "",
    active: row.ativo,
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
  };
}

function aggregateMetrics(rows: RawCampaignMetric[]): DbMetricRow | undefined {
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
      acc.reach += row.reach;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.results += row.results;
      acc.leads += row.leads;
      acc.resultLabels.push(row.resultLabel);
      acc.roi.push(row.roi);
      acc.roas.push(row.roas);
      acc.frequency.push(row.frequency);
      return acc;
    },
    {
      amount_spent: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      leads: 0,
      resultLabels: [] as string[],
      roi: [] as number[],
      roas: [] as number[],
      frequency: [] as number[],
    },
  );

  return {
    campaign_id: normalizedRows[0].campaignId,
    date:
      normalizedRows[normalizedRows.length - 1]?.date ??
      normalizedRows[0].date,
    granularity: "day",
    hour_bucket: -1,
    hour_label: "",
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
    cost_per_lead:
      totals.leads > 0 ? totals.amount_spent / totals.leads : 0,
    roi: average(totals.roi),
    roas: average(totals.roas),
    frequency: average(totals.frequency),
  };
}

function mapCampaign(
  row: DbCampaignRow,
  metric?: DbMetricRow,
): CampaignWithMetrics {
  return {
    id: row.id,
    name: row.nome,
    status: row.status === "Ativa" ? "Ativa" : "Pausada",
    platform: row.plataforma,
    clientId: row.client_id,
    clientName: row.clients?.[0]?.nome_empresa,
    metrics: {
      amountSpent: formatCurrency(metric?.amount_spent ?? 0),
      reach: String(metric?.reach ?? 0),
      impressions: String(metric?.impressions ?? 0),
      clicks: String(metric?.clicks ?? 0),
      ctr: `${(metric?.ctr ?? 0).toFixed(2)}%`,
      results: String(metric?.result_count ?? metric?.leads ?? 0),
      resultLabel: metric?.result_label ?? "Leads no site",
      cpc: formatCurrency(metric?.cpc ?? 0),
      cpm: formatCurrency(metric?.cpm ?? 0),
      leads: String(metric?.leads ?? 0),
      costPerLead: formatCurrency(metric?.cost_per_lead ?? 0),
      roi: `${(metric?.roi ?? 0).toFixed(2)}%`,
      roas: `${(metric?.roas ?? 0).toFixed(2)}x`,
      frequency: (metric?.frequency ?? 0).toFixed(2),
      periodLabel: metric ? "Última sincronização" : "Aguardando importação",
    },
  };
}

export async function getAppSnapshot(): Promise<AppDataSnapshot> {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return getMockSnapshot();
  }

  const [usersResult, clientsResult, campaignsResult, permissionsResult, metricRowsFromDb, reportsResult, syncStatusResult] =
    await Promise.all([
      adminClient
        .from("users")
        .select("id, auth_user_id, nome, username, email, role, whatsapp, ativo, client_id, clients(nome_empresa)")
        .order("created_at", { ascending: true }),
      adminClient
        .from("clients")
        .select("id, nome_empresa, responsavel, whatsapp, observacoes, ativo")
        .order("created_at", { ascending: true }),
      adminClient
        .from("campaigns")
        .select("id, nome, status, plataforma, client_id, clients(nome_empresa)")
        .order("created_at", { ascending: true }),
      adminClient
        .from("user_campaign_permissions")
        .select("user_id, campaign_id"),
      fetchAllMetricRows(adminClient),
      adminClient
        .from("ai_reports")
        .select("id, client_id, period_start, period_end, generated_text, created_at, clients(nome_empresa, whatsapp)")
        .order("created_at", { ascending: false }),
      adminClient
        .from("sync_statuses")
        .select("provider, interval_minutes, status, last_attempt_at, last_success_at, next_run_at, message"),
    ]);

  if (usersResult.error || clientsResult.error || campaignsResult.error || permissionsResult.error || reportsResult.error) {
    throw new Error(
      usersResult.error?.message ||
        clientsResult.error?.message ||
        campaignsResult.error?.message ||
        permissionsResult.error?.message ||
        reportsResult.error?.message ||
        "Falha ao carregar os dados do Supabase.",
    );
  }

  const metricRows = metricRowsFromDb.map(mapMetricRow);
  const metricRowsByCampaign = new Map<string, RawCampaignMetric[]>();

  for (const row of metricRows) {
    const items = metricRowsByCampaign.get(row.campaignId) ?? [];
    items.push(row);
    metricRowsByCampaign.set(row.campaignId, items);
  }

  const syncStatuses =
    syncStatusResult.error || !syncStatusResult.data
      ? [await getMetaSyncStatus()]
      : (syncStatusResult.data as DbSyncStatusRow[]).map((row) => ({
          provider: row.provider,
          intervalMinutes: row.interval_minutes,
          status: row.status,
          lastAttemptAt: row.last_attempt_at,
          lastSuccessAt: row.last_success_at,
          nextRunAt: row.next_run_at,
          message: row.message,
        }));

  return {
    users: (usersResult.data as DbUserRow[]).map(mapUser),
    clients: (clientsResult.data as DbClientRow[]).map(mapClient),
    campaigns: (campaignsResult.data as DbCampaignRow[]).map((row) =>
      mapCampaign(row, aggregateMetrics(metricRowsByCampaign.get(row.id) ?? [])),
    ),
    permissions: (permissionsResult.data as DbPermissionRow[]).map((item) => ({
      userId: item.user_id,
      campaignId: item.campaign_id,
    })),
    reports:
      (reportsResult.data as DbReportRow[]).length > 0
        ? (reportsResult.data as DbReportRow[]).slice(0, 10).map((report) => ({
            id: report.id,
            clientId: report.client_id ?? undefined,
            clientName: report.clients?.[0]?.nome_empresa ?? "Cliente removido",
            whatsapp: report.clients?.[0]?.whatsapp ?? "",
            periodLabel: formatReportPeriodLabel(report.period_start, report.period_end),
            preview: report.generated_text.slice(0, 160),
            generatedText: report.generated_text,
            createdAt: report.created_at,
          }))
        : getMockSnapshot().reports,
    metricRows,
    syncStatuses,
  };
}

export async function getClientUsers() {
  const snapshot = await getAppSnapshot();
  return snapshot.users.filter((user) => user.role === "client");
}

export async function getAdminViewData() {
  const snapshot = await getAppSnapshot();
  return {
    clients: snapshot.clients,
    campaigns: snapshot.campaigns,
    permissions: snapshot.permissions,
    reports: snapshot.reports,
    metricRows: snapshot.metricRows,
    clientUsers: snapshot.users.filter((user) => user.role === "client"),
  };
}

export async function getAdminClientProfileData(clientId: string) {
  const snapshot = await getAppSnapshot();
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

  const allowedCampaigns = snapshot.campaigns.filter((campaign) =>
    selectedCampaignIds.includes(campaign.id),
  );

  return {
    client,
    linkedUser,
    selectedCampaignIds,
    allowedCampaigns,
    allCampaigns: snapshot.campaigns,
    metricRows: snapshot.metricRows.filter((row) =>
      selectedCampaignIds.includes(row.campaignId),
    ),
  };
}

export async function getCampaignsVisibleToUser(userId: string) {
  const snapshot = await getAppSnapshot();
  const allowedIds = new Set(
    snapshot.permissions
      .filter((permission) => permission.userId === userId)
      .map((permission) => permission.campaignId),
  );

  return snapshot.campaigns.filter((campaign) => allowedIds.has(campaign.id));
}

export async function getClientDashboardData(user: User) {
  const snapshot = await getAppSnapshot();
  const campaigns = await getCampaignsVisibleToUser(user.id);
  const allowedIds = new Set(campaigns.map((campaign) => campaign.id));

  return {
    campaigns,
    metricRows: snapshot.metricRows.filter((row) => allowedIds.has(row.campaignId)),
    reports: getReportHistory(),
    syncStatus:
      snapshot.syncStatuses.find((status) => status.provider === "meta_ads") ??
      null,
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
