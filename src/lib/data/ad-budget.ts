import "server-only";

import { cache } from "react";
import { revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import {
  addDays,
  computeBudgetReport,
  LEGACY_USD_RATE,
  planClientStatusSync,
  type ClientStatusChange,
  type BudgetCampaign,
  type BudgetReport,
  type BudgetSpendRow,
  type ControlClient,
} from "@/lib/ad-budget";
import { CACHE_TAGS, getAdminClientsListData } from "@/lib/data/queries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { META_TAX_RATE } from "@/lib/taxes";

// Supabase do sistema de controle (pagamentos). Acesso SOMENTE LEITURA e só
// no servidor: a chave secreta nunca vai para o navegador nem para o app.
function controlCredentials() {
  const url = process.env.CONTROLE_SUPABASE_URL?.trim();
  const key = (
    process.env.CONTROLE_SUPABASE_SECRET_KEY ??
    process.env.CONTROLE_SUPABASE_SERVICE_ROLE_KEY
  )?.trim();

  return url && key ? { url, key } : null;
}

export function isControlConfigured() {
  return controlCredentials() !== null;
}

// O controle guarda tudo num único documento JSON (app_state.id = "main").
async function fetchControlClients(): Promise<ControlClient[]> {
  const credentials = controlCredentials();
  if (!credentials) {
    throw new Error("Sistema de controle não configurado.");
  }

  const control = createClient(credentials.url, credentials.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await control
    .from("app_state")
    .select("data")
    .eq("id", "main")
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível ler o sistema de controle: ${error.message}`);
  }

  const clients = (data?.data as { clients?: unknown } | null)?.clients;
  return Array.isArray(clients) ? (clients as ControlClient[]) : [];
}

async function fetchDailySpend(since: string, until: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return [] as BudgetSpendRow[];
  }

  const rows: BudgetSpendRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from("campaign_metrics")
      .select("campaign_id, date, amount_spent, currency, exchange_rate")
      .eq("granularity", "day")
      .gte("date", since)
      .lte("date", until)
      .order("date", { ascending: true })
      .order("campaign_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data ?? []) as {
      campaign_id: string;
      date: string;
      amount_spent: number | string;
      currency: string | null;
      exchange_rate: number | string | null;
    }[];

    for (const row of batch) {
      rows.push({
        campaignId: row.campaign_id,
        date: row.date,
        amountSpent: Number(row.amount_spent || 0),
        currency: row.currency ?? "BRL",
        exchangeRate: Number(row.exchange_rate || 1),
      });
    }

    if (batch.length < pageSize) {
      return rows;
    }
  }
}

function saoPauloToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function legacyUsdRate() {
  const value = Number(process.env.CONTROLE_USD_RATE);
  return Number.isFinite(value) && value > 0 ? value : LEGACY_USD_RATE;
}

// Espelha Ativo/Inativo do controle nos clientes do dashboard. Roda junto com
// a sincronização da Meta (rota /api/sync-meta e botão "Atualizar métricas").
// Lê direto do banco, sem cache, para não decidir em cima de dado velho.
export async function syncClientStatusFromControl(): Promise<ClientStatusChange[]> {
  if (!isControlConfigured()) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return [];
  }

  const [controlClients, clientsResult, codesResult] = await Promise.all([
    fetchControlClients(),
    admin.from("clients").select("id, nome_empresa, ativo"),
    admin.from("client_campaign_codes").select("client_id, code").eq("status", "active"),
  ]);

  if (clientsResult.error) throw new Error(clientsResult.error.message);
  if (codesResult.error) throw new Error(codesResult.error.message);

  const codeByClient = new Map(
    (codesResult.data ?? []).map((row) => [row.client_id as string, row.code as string]),
  );
  const changes = planClientStatusSync(
    controlClients,
    (clientsResult.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.nome_empresa as string,
      code: codeByClient.get(row.id as string),
      active: Boolean(row.ativo),
    })),
  );

  for (const active of [true, false]) {
    const ids = changes.filter((change) => change.active === active).map((change) => change.clientId);
    if (!ids.length) continue;

    const { error } = await admin.from("clients").update({ ativo: active }).in("id", ids);
    if (error) throw new Error(error.message);
  }

  if (changes.length) {
    // revalidateTag com expire 0 vale em Server Action e em Route Handler.
    revalidateTag(CACHE_TAGS.clients, { expire: 0 });
  }

  return changes;
}

export const getAdBudgetReport = cache(async (): Promise<BudgetReport> => {
  const today = saoPauloToday();
  const [controlClients, list] = await Promise.all([
    fetchControlClients(),
    getAdminClientsListData(),
  ]);

  // Campanha → cliente: vínculo direto (código no nome da campanha) e, na
  // falta dele, a permissão dada ao usuário do cliente.
  const clientByUser = new Map(
    list.clientUsers
      .filter((user) => user.clientId)
      .map((user) => [user.id, user.clientId as string] as const),
  );
  const clientByPermission = new Map<string, string>();
  for (const permission of list.permissions) {
    const clientId = clientByUser.get(permission.userId);
    if (clientId && !clientByPermission.has(permission.campaignId)) {
      clientByPermission.set(permission.campaignId, clientId);
    }
  }
  const campaigns: BudgetCampaign[] = list.campaigns.map((campaign) => ({
    id: campaign.id,
    clientId: campaign.clientId ?? clientByPermission.get(campaign.id) ?? null,
    active: campaign.status === "Ativa",
  }));

  // Busca o gasto a partir da verba paga mais antiga (o saldo é acumulado
  // desde o início) e pelo menos a última semana.
  const earliestPaid = controlClients
    .flatMap((client) => client.installments ?? [])
    .filter((item) => Number(item.trafficAdditional || 0) > 0)
    .flatMap((item) => [item.paidDate, item.dueDate])
    .filter((day): day is string => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort()[0];
  const weekAgo = addDays(today, -7);
  const since = earliestPaid && earliestPaid < weekAgo ? earliestPaid : weekAgo;

  const spendRows = await fetchDailySpend(since, today);

  return computeBudgetReport({
    controlClients,
    dashboardClients: list.clients.map((client) => ({
      id: client.id,
      name: client.companyName,
      code: client.campaignCode,
      active: client.active,
    })),
    campaigns,
    spendRows,
    today,
    taxRate: META_TAX_RATE,
    usdRate: legacyUsdRate(),
  });
});
