import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { ClosingDocument } from "@/components/pdf/closing-document";
import * as aiActions from "@/app/dashboard/atendimento-ia/actions";
import { refreshClientMetricsAction } from "@/app/dashboard/actions";
import {
  syncMetaAction,
  toggleCampaignStatusAction,
} from "@/app/admin/campanhas/actions";
import { setAiAllPlansAction } from "@/app/admin/configuracoes/ai-plan-actions";
import { changeOwnPasswordAction } from "@/app/dashboard/perfil/actions";
import {
  moveLeadsAction,
  registerClosedDealAction,
  saveLeadNoteAction,
} from "@/app/conversoes/actions";
import { runWithMobileToken } from "@/lib/auth/mobile-context";
import { applyOwnProfileUpdate } from "@/lib/auth/own-profile";
import { getSupabaseCurrentUser } from "@/lib/auth/supabase-auth";
import {
  aiAdminClient,
  getAiAllPlans,
  getAiLiveFingerprint,
  getClientAiAccess,
} from "@/lib/ai-agent/store";
import { manualReviewYear } from "@/lib/ai-agent/policy";
import { toAiAccessState, toClientPlanType } from "@/lib/ai-agent/shared";
import {
  goalCopy,
  isFunnelStage,
  MIXED_GOAL_COPY,
  type PeriodOption,
  type QualificationTab,
} from "@/lib/conversions/shared";
import {
  buildPerformanceSeries,
  calculateChange,
  filterMetricsByRange,
  getDateRangeForPeriod,
  getPreviousDateRange,
  getReferenceNowForPeriod,
  summarizeMetrics,
  sumResults,
  type DashboardPeriodValue,
} from "@/lib/dashboard-metrics";
import { getAdBudgetReport, isControlConfigured } from "@/lib/data/ad-budget";
import { getAdLevelData } from "@/lib/data/ad-levels";
import { getAiAgentPageData, getAiConversationDetail } from "@/lib/data/ai-agent";
import { getClosingData, parseClosingCampaignIds } from "@/lib/data/closing";
import { resolveClosingWindow } from "@/lib/data/closing-window";
import {
  getConversionLeads,
  resolveBoardGoalType,
} from "@/lib/data/conversions";
import { resolveMetricsWindow } from "@/lib/data/date-range";
import {
  CACHE_TAGS,
  getAdminCampaignsData,
  getAdminClientsListData,
  getAppShellData,
  getCampaignIdsForUser,
  getClientPortalData,
} from "@/lib/data/queries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { firstEmbedded, type Embedded } from "@/lib/supabase/embedded";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { breakdownMetaTaxes } from "@/lib/taxes";
import type { User } from "@/lib/types";

// API do app do cliente. Não tem regra própria: chama as mesmas funções e
// actions do painel, com o JWT do usuário no lugar do cookie.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "private, no-store" };
const IDENTIFIER_PATTERN = /^[a-z0-9._@+-]{2,120}$/;

const PERIODS: Record<string, { slug: string; label: DashboardPeriodValue }> = {
  hoje: { slug: "hoje", label: "Hoje" },
  ontem: { slug: "ontem", label: "Ontem" },
  d7: { slug: "d7", label: "Últimos 7 dias" },
  d30: { slug: "d30", label: "Últimos 30 dias" },
  mes: { slug: "mes", label: "Este mês" },
  "mes-passado": { slug: "mes-passado", label: "Mês passado" },
  custom: { slug: "custom", label: "Personalizado" },
};

// Ações do Atendimento IA liberadas ao app. Lista fechada: o nome vem da
// requisição e nunca pode alcançar outro export do módulo.
const AI_FORM_ACTIONS = {
  toggle: aiActions.toggleAiAgentAction,
  saveNotification: aiActions.saveNotificationNumberAction,
  testNotification: aiActions.testNotificationNumberAction,
  saveAdvanced: aiActions.saveAiAdvancedSettingsAction,
  setHumanTakeover: aiActions.setHumanTakeoverAction,
  saveKnowledge: aiActions.saveAiKnowledgeAction,
  saveSchedule: aiActions.saveAiScheduleAction,
  saveScript: aiActions.saveAiScriptAction,
  saveActivation: aiActions.saveAiActivationAction,
  addBlocked: aiActions.addBlockedNumberAction,
  updateBlocked: aiActions.updateBlockedNumberAction,
  toggleBlocked: aiActions.toggleBlockedNumberAction,
  deleteBlocked: aiActions.deleteBlockedNumberAction,
  saveProfile: aiActions.saveAiProfileAction,
  deleteConversation: aiActions.deleteAiConversationAction,
} as const;

const AI_RESTORE_ACTIONS = {
  restoreScript: aiActions.restoreAiScriptAction,
  restoreActivation: aiActions.restoreAiActivationAction,
} as const;

type RouteContext = { params: Promise<{ path: string[] }> };
type JsonBody = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function actionResponse(result: { success?: string; error?: string }) {
  return json(result, result.error ? 422 : 200);
}

function bearerToken(request: NextRequest) {
  const match = (request.headers.get("authorization") ?? "").match(
    /^Bearer\s+(.+)$/i,
  );
  return match?.[1] ?? null;
}

async function readBody(request: NextRequest): Promise<JsonBody> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as JsonBody)
      : {};
  } catch {
    return {};
  }
}

function toFormData(fields: unknown) {
  const form = new FormData();

  if (!fields || typeof fields !== "object") {
    return form;
  }

  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== null && item !== undefined) {
        form.append(key, String(item));
      }
    }
  }

  return form;
}

function metricsWindowFrom(params: URLSearchParams, role: User["role"]) {
  const period = PERIODS[params.get("periodo") ?? "d30"] ?? PERIODS.d30;
  const start = params.get("inicio") ?? undefined;
  const end = params.get("fim") ?? undefined;
  const compare = params.get("comparar") === "1";
  const customRange =
    period.slug === "custom" && start && end ? { start, end } : undefined;

  return {
    period,
    compare,
    customRange,
    window: resolveMetricsWindow(role, {
      periodo: period.slug,
      start,
      end,
      comparar: compare ? "anterior" : "nenhum",
    }),
  };
}

async function handleLogin(request: NextRequest) {
  const body = await readBody(request);
  const identifier = String(body.identifier ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const invalid = () => json({ error: "Usuário ou senha incorretos." }, 401);

  // O identificador entra num filtro `.or()`: só caracteres de usuário/e-mail.
  if (!IDENTIFIER_PATTERN.test(identifier) || !password) {
    return invalid();
  }

  const admin = createSupabaseAdminClient();
  const url = getSupabaseUrl();
  const anonKey = getSupabasePublishableKey();

  if (!admin || !url || !anonKey) {
    return json({ error: "Serviço indisponível no momento." }, 503);
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("email, role, ativo, clients(ativo)")
    .or(`username.eq.${identifier},email.eq.${identifier}`)
    .maybeSingle<{
      email: string;
      role: string;
      ativo: boolean;
      clients: Embedded<{ ativo: boolean }>;
    }>();

  if (profileError) {
    return json({ error: "Serviço indisponível no momento." }, 503);
  }

  if (!profile?.ativo) {
    return invalid();
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: profile.email,
    password,
  });

  if (error || !data.session) {
    return invalid();
  }

  // Só depois da senha certa o motivo do bloqueio pode ser revelado.
  if (profile.role !== "client" && profile.role !== "admin") {
    return json({ error: "Este usuário não tem acesso ao app." }, 403);
  }

  if (profile.role === "client" && firstEmbedded(profile.clients)?.ativo === false) {
    return json(
      { error: "Sua conta está inativa. Fale com a equipe Tráfego Academy." },
      403,
    );
  }

  return json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
}

// Cliente nunca escolhe o escopo: o filtro de cliente só vale para o admin.
function scopeClientId(user: User, params: URLSearchParams) {
  if (user.role !== "admin") return null;
  const value = params.get("cliente");
  return value && UUID_PATTERN.test(value) ? value : null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleMe(user: User) {
  if (user.role === "admin") {
    const shell = await getAppShellData(user);
    return json({
      role: "admin",
      user: {
        name: user.name,
        username: user.username,
        email: user.email,
        whatsapp: user.whatsapp,
        active: user.active,
        clientName: "Tráfego Academy",
      },
      clients: shell.clients,
      plan: "complete",
      aiAccess: "not_configured",
      campaignCount: shell.campaigns.length,
      goalType: "mixed",
      goal: { ...goalCopy("vehicle_acquisition"), ...MIXED_GOAL_COPY },
      goals: {
        vehicle_acquisition: goalCopy("vehicle_acquisition"),
        sale: goalCopy("sale"),
      },
    });
  }

  const [campaignIds, goalType, access] = await Promise.all([
    getCampaignIdsForUser(user),
    resolveBoardGoalType(user),
    user.clientId ? getClientAiAccess(user.clientId).catch(() => null) : null,
  ]);

  return json({
    role: "client",
    user: {
      name: user.name,
      username: user.username,
      email: user.email,
      whatsapp: user.whatsapp,
      active: user.active,
      clientName: user.clientName ?? user.name,
    },
    clients: [],
    goals: {
      vehicle_acquisition: goalCopy("vehicle_acquisition"),
      sale: goalCopy("sale"),
    },
    plan: access?.plan ?? "essential",
    aiAccess: access ? toAiAccessState(access.decision) : "error",
    campaignCount: campaignIds.size,
    goalType,
    goal: goalCopy(goalType === "sale" ? "sale" : "vehicle_acquisition"),
  });
}

async function handlePanel(user: User, params: URLSearchParams) {
  const { period, compare, customRange, window } = metricsWindowFrom(
    params,
    user.role,
  );
  const clientId = scopeClientId(user, params);
  const { campaigns, metricRows, syncStatus } =
    user.role === "admin"
      ? {
          ...(await getAdminCampaignsData(window, clientId)),
          syncStatus: (await getAppShellData(user)).syncStatus,
        }
      : await getClientPortalData(user, window);
  const reference = getReferenceNowForPeriod(
    metricRows,
    period.label,
    customRange,
  );
  const range = getDateRangeForPeriod(period.label, customRange, reference);
  const currentRows = filterMetricsByRange(metricRows, range);
  const previousRows = compare
    ? filterMetricsByRange(metricRows, getPreviousDateRange(range))
    : [];
  const totals = summarizeMetrics(currentRows);
  const previous = summarizeMetrics(previousRows);

  const rows = campaigns
    .map((campaign) => {
      const campaignRows = currentRows.filter(
        (row) => row.campaignId === campaign.id,
      );
      const summary = summarizeMetrics(campaignRows);
      const results = sumResults(campaignRows);

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        resultLabel: campaign.metrics.resultLabel,
        amountSpent: summary.amountSpentWithTax,
        results,
        costPerResult: results > 0 ? summary.amountSpent / results : 0,
        ctr: summary.ctr,
        roas: summary.roas,
        clicks: summary.clicks,
        impressions: summary.impressions,
        hasMetrics: campaignRows.length > 0,
      };
    })
    .filter((campaign) => campaign.hasMetrics)
    .sort((a, b) => b.amountSpent - a.amountSpent);

  return json({
    hasData: currentRows.length > 0,
    compare,
    totals,
    previous: compare ? previous : null,
    changes: compare
      ? {
          spent: calculateChange(totals.amountSpent, previous.amountSpent),
          clicks: calculateChange(totals.clicks, previous.clicks),
          impressions: calculateChange(totals.impressions, previous.impressions),
          results: calculateChange(totals.results, previous.results),
          ctr: calculateChange(totals.ctr, previous.ctr),
          costPerResult: calculateChange(totals.costPerLead, previous.costPerLead),
        }
      : null,
    taxes: breakdownMetaTaxes(totals.amountSpent),
    series: buildPerformanceSeries(metricRows, period.label, customRange, reference),
    campaigns: rows,
    syncStatus,
  });
}

async function handleLevels(user: User, params: URLSearchParams) {
  const level = params.get("nivel") === "ad" ? "ad" : "adset";
  const { window } = metricsWindowFrom(params, user.role);
  const isAdmin = user.role === "admin";
  const allowed = isAdmin ? null : [...(await getCampaignIdsForUser(user))];
  const data = await getAdLevelData(
    level,
    { ...window, includeHourly: false },
    isAdmin ? scopeClientId(user, params) : user.clientId,
    {
      campaignId: params.get("campanha"),
      adSetId: params.get("conjunto"),
    },
    allowed,
  );

  return json(data);
}

async function handleLeads(user: User, params: URLSearchParams) {
  const rawTab = params.get("etapa") ?? "todos";
  const rawPeriod = params.get("periodo") ?? "30";
  const tab: QualificationTab = isFunnelStage(rawTab) ? rawTab : "todos";
  const period: PeriodOption =
    rawPeriod === "7" || rawPeriod === "tudo" ? rawPeriod : "30";

  const clientId = scopeClientId(user, params);
  const [result, goalType] = await Promise.all([
    getConversionLeads(user, {
      tab,
      period,
      clientId,
      page: Number(params.get("pagina") ?? 1),
    }),
    resolveBoardGoalType(user, clientId),
  ]);

  return json({
    ...result,
    goalType,
    goal:
      goalType === "mixed"
        ? { ...goalCopy("vehicle_acquisition"), ...MIXED_GOAL_COPY }
        : goalCopy(goalType),
  });
}

type AdminAiRow = {
  client_id: string;
  nome_empresa: string;
  plan_type: string | null;
  ai_enabled: boolean;
  whatsapp_status: string | null;
  whatsapp_phone: string | null;
  total_conversations: number | string;
  qualified_conversations: number | string;
};

async function handleAdminClients() {
  const data = await getAdminClientsListData();

  return json({
    clients: data.clients.map((client) => {
      const users = data.clientUsers.filter((item) => item.clientId === client.id);
      const userIds = new Set(users.map((item) => item.id));
      const campaignIds = new Set([
        ...data.permissions
          .filter((permission) => userIds.has(permission.userId))
          .map((permission) => permission.campaignId),
        ...data.campaigns
          .filter((campaign) => campaign.clientId === client.id)
          .map((campaign) => campaign.id),
      ]);

      return {
        id: client.id,
        companyName: client.companyName,
        contactName: client.contactName,
        whatsapp: client.whatsapp,
        active: client.active,
        planType: client.planType,
        segment: client.segment ?? null,
        conversionGoalType: client.conversionGoalType,
        campaignCode: client.campaignCode ?? null,
        username: users[0]?.username ?? null,
        userActive: users[0]?.active ?? null,
        campaignCount: campaignIds.size,
      };
    }),
  });
}

async function handleAdminAi() {
  const [overview, allPlans] = await Promise.all([
    aiAdminClient().rpc("admin_ai_agent_overview"),
    getAiAllPlans().catch(() => null),
  ]);

  if (overview.error) {
    throw new Error(overview.error.message);
  }

  return json({
    allPlans,
    rows: ((overview.data as AdminAiRow[] | null) ?? []).map((row) => ({
      clientId: row.client_id,
      companyName: row.nome_empresa,
      planType: toClientPlanType(row.plan_type),
      aiEnabled: row.ai_enabled,
      whatsappStatus: row.whatsapp_status,
      whatsappPhone: row.whatsapp_phone,
      total: Number(row.total_conversations) || 0,
      qualified: Number(row.qualified_conversations) || 0,
    })),
  });
}

// Verba x gasto: mesmo relatório da página /admin/verba do site.
async function handleAdminBudget() {
  if (!isControlConfigured()) {
    return json({ configured: false });
  }

  return json({ configured: true, report: await getAdBudgetReport() });
}

function closingRequest(user: User, params: URLSearchParams) {
  return {
    window: resolveClosingWindow(user.role, {
      inicio: params.get("inicio"),
      fim: params.get("fim"),
      preset: params.get("preset"),
    }),
    campaignIds: parseClosingCampaignIds(params.getAll("campanha")),
  };
}

async function handleClosingPdf(user: User, params: URLSearchParams) {
  const { window, campaignIds } = closingRequest(user, params);
  const data = await getClosingData(
    user,
    window,
    scopeClientId(user, params),
    campaignIds,
  );
  const buffer = await renderToBuffer(ClosingDocument({ data }));

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="fechamento-${window.startDate}-a-${window.endDate}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

async function handleAiLiveState(user: User) {
  if (!user.clientId) {
    return json({ access: "not_configured", fingerprint: null });
  }

  const access = toAiAccessState((await getClientAiAccess(user.clientId)).decision);

  return json({
    access,
    fingerprint:
      access === "allowed" ? await getAiLiveFingerprint(user.clientId) : null,
  });
}

async function routeGet(
  user: User,
  route: string,
  params: URLSearchParams,
): Promise<NextResponse> {
  switch (route) {
    case "me":
      return handleMe(user);
    case "painel":
      return handlePanel(user, params);
    case "niveis":
      return handleLevels(user, params);
    case "leads":
      return handleLeads(user, params);
    case "fechamento": {
      const { window, campaignIds } = closingRequest(user, params);
      return json(
        await getClosingData(
          user,
          window,
          scopeClientId(user, params),
          campaignIds,
        ),
      );
    }
    case "admin/clientes":
      return user.role === "admin" ? handleAdminClients() : forbidden();
    case "admin/ia":
      return user.role === "admin" ? handleAdminAi() : forbidden();
    case "admin/verba":
      return user.role === "admin" ? handleAdminBudget() : forbidden();
    case "fechamento/pdf":
      return handleClosingPdf(user, params);
    case "ia": {
      const { settings, ...data } = await getAiAgentPageData(user);
      const { prompt: _prompt, ...safeSettings } = settings;
      void _prompt;
      return json({
        ...data,
        settings: safeSettings,
        // Mesma regra do selo "Análise manual" do painel.
        conversations: data.conversations.map((item) => ({
          ...item,
          needsReview:
            item.status === "qualified" &&
            Boolean(manualReviewYear(item.vehicleYear, settings.knowledge.profile)),
        })),
      });
    }
    case "ia/estado":
      return handleAiLiveState(user);
    case "ia/conversa": {
      const detail = await getAiConversationDetail(
        user,
        params.get("id") ?? "",
      );
      return detail ? json(detail) : json({ error: "Conversa não encontrada." }, 404);
    }
    default:
      return json({ error: "not_found" }, 404);
  }
}

async function routePost(
  user: User,
  route: string,
  body: JsonBody,
): Promise<NextResponse> {
  switch (route) {
    case "metricas/atualizar":
      return actionResponse(
        user.role === "admin"
          ? await syncMetaAction({}, new FormData())
          : await refreshClientMetricsAction({}, new FormData()),
      );
    case "admin/campanha/status":
      return actionResponse(
        await toggleCampaignStatusAction(
          String(body.campaignId ?? ""),
          body.active === true,
        ),
      );
    case "admin/ia/todos-planos":
      return actionResponse(await setAiAllPlansAction(body.enabled === true));
    case "leads/mover":
      return actionResponse(
        await moveLeadsAction(
          Array.isArray(body.leadIds) ? body.leadIds.map(String) : [],
          body.stage as Parameters<typeof moveLeadsAction>[1],
        ),
      );
    case "leads/fechar":
      return actionResponse(
        await registerClosedDealAction(
          String(body.leadId ?? ""),
          Number(body.value),
        ),
      );
    case "leads/observacao":
      return actionResponse(
        await saveLeadNoteAction(
          String(body.leadId ?? ""),
          String(body.note ?? ""),
        ),
      );
    case "perfil": {
      const result = await applyOwnProfileUpdate(user, {
        name: body.name,
        email: body.email,
      });

      if (result.error) {
        return json({ error: result.error }, 422);
      }

      // updateTag só funciona em Server Action; aqui a expiração é imediata.
      revalidateTag(CACHE_TAGS.users, { expire: 0 });
      revalidatePath("/dashboard/perfil");
      return json({ success: "Dados atualizados." });
    }
    case "perfil/senha":
      return actionResponse(
        await changeOwnPasswordAction({}, toFormData(body)),
      );
    case "ia/acao": {
      const action = String(body.action ?? "");

      if (Object.hasOwn(AI_RESTORE_ACTIONS, action)) {
        const run = AI_RESTORE_ACTIONS[action as keyof typeof AI_RESTORE_ACTIONS];
        return actionResponse(await run());
      }

      if (Object.hasOwn(AI_FORM_ACTIONS, action)) {
        const run = AI_FORM_ACTIONS[action as keyof typeof AI_FORM_ACTIONS];
        return actionResponse(await run({}, toFormData(body.fields)));
      }

      return json({ error: "Ação inválida." }, 400);
    }
    default:
      return json({ error: "not_found" }, 404);
  }
}

function forbidden() {
  return json({ error: "Sem permissão para esta área." }, 403);
}

async function withUser(
  request: NextRequest,
  run: (user: User) => Promise<NextResponse>,
) {
  const token = bearerToken(request);

  if (!token) {
    return json({ error: "unauthorized" }, 401);
  }

  return runWithMobileToken(token, async () => {
    try {
      // Mesmas regras de acesso do site (usuário ativo e empresa ativa).
      const user = await getSupabaseCurrentUser();

      if (!user || !user.active) {
        return json({ error: "unauthorized" }, 401);
      }

      return await run(user);
    } catch (error) {
      console.error("[api/mobile] falha", {
        path: request.nextUrl.pathname,
        message: error instanceof Error ? error.message : "erro desconhecido",
      });
      // 503: o app mostra falha de conexão, nunca bloqueio da conta.
      return json({ error: "Não foi possível concluir agora." }, 503);
    }
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const route = (await context.params).path.join("/");
  return withUser(request, (user) =>
    routeGet(user, route, request.nextUrl.searchParams),
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const route = (await context.params).path.join("/");

  if (route === "login") {
    return handleLogin(request);
  }

  return withUser(request, async (user) =>
    routePost(user, route, await readBody(request)),
  );
}
