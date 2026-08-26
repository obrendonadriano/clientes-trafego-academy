import { subDays } from "date-fns";
import { isDevelopmentAuthFallbackEnabled } from "@/lib/auth/mode";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { type Embedded, firstEmbedded } from "@/lib/supabase/embedded";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  LEADS_PAGE_SIZE,
  type CapiStatus,
  type ConversionLead,
  type ConversionLeadsResult,
  type ConversionSummary,
  type LeadQualification,
  type PeriodOption,
  type QualificationTab,
} from "@/lib/conversions/shared";
import type { User } from "@/lib/types";

// Leads de conversão vindos das campanhas. O cliente marca quais foram bons e
// uma automação em n8n envia essa marcação ao Meta (Conversions API), para o
// algoritmo aprender a buscar pessoas parecidas.
//
// O isolamento é feito por RLS no banco: admin vê todos os clientes, cliente vê
// só os dele. Por isso a leitura usa o client AUTENTICADO (cookies da sessão) e
// não o client de serviço — que ignoraria as policies.

export type {
  CapiStatus,
  ConversionLead,
  ConversionLeadsResult,
  ConversionSummary,
  LeadQualification,
  PeriodOption,
  QualificationTab,
} from "@/lib/conversions/shared";

type LeadRow = {
  id: string;
  client_id: string;
  campaign_id: string | null;
  telefone: string;
  nome: string | null;
  email: string | null;
  ctwa_clid: string | null;
  qualificacao: LeadQualification;
  observacao: string | null;
  capi_status: CapiStatus;
  capi_enviado_em: string | null;
  capi_resposta: string | null;
  criado_em: string;
  campaigns?: Embedded<{ nome: string }>;
  clients?: Embedded<{ nome_empresa: string }>;
};

const SELECT_COLUMNS =
  "id, client_id, campaign_id, telefone, nome, email, ctwa_clid, qualificacao, observacao, capi_status, capi_enviado_em, capi_resposta, criado_em, campaigns(nome), clients(nome_empresa)";

function mapLead(row: LeadRow, canSeeCapiError: boolean): ConversionLead {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: firstEmbedded(row.clients)?.nome_empresa ?? null,
    campaignId: row.campaign_id,
    campaignName: firstEmbedded(row.campaigns)?.nome ?? null,
    name: row.nome,
    phone: row.telefone,
    email: row.email,
    // O identificador do clique é o que liga o lead ao anúncio na Meta.
    hasClickId: Boolean(row.ctwa_clid),
    qualification: row.qualificacao,
    note: row.observacao,
    capiStatus: row.capi_status,
    capiSentAt: row.capi_enviado_em,
    capiResponse: canSeeCapiError ? row.capi_resposta : null,
    createdAt: row.criado_em,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function resolveStartDate(period: PeriodOption, now = new Date()) {
  if (period === "tudo") {
    return null;
  }

  return subDays(now, Number(period)).toISOString();
}

// Client de leitura: prioriza a sessão do usuário (RLS aplica). Em
// desenvolvimento, quando se está logado pelo atalho de sessão mock e não há
// sessão Supabase, cai para o client de serviço com o filtro por cliente feito
// à mão — apenas para conseguir trabalhar na tela localmente.
async function resolveReadClient(user: User) {
  const serverClient = await createSupabaseServerClient();

  if (serverClient) {
    // Em produção, getCurrentUser já validou as claims e o Postgres aplica RLS
    // usando o JWT dos cookies. Evita uma segunda chamada de Auth pela rede.
    if (!isDevelopmentAuthFallbackEnabled()) {
      return { client: serverClient, enforceClientFilter: false };
    }

    // O fallback mock só existe em desenvolvimento; aqui precisamos distinguir
    // uma sessão Supabase real antes de recorrer ao client de serviço.
    const { data } = await serverClient.auth.getClaims();

    if (data?.claims?.sub) {
      return { client: serverClient, enforceClientFilter: false };
    }
  }

  if (isDevelopmentAuthFallbackEnabled() && isSupabaseAdminConfigured()) {
    const adminClient = createSupabaseAdminClient();

    if (adminClient) {
      return {
        client: adminClient,
        // Sem sessão não há RLS: o recorte do cliente vira responsabilidade
        // desta camada. Só acontece em desenvolvimento.
        enforceClientFilter: user.role !== "admin",
      };
    }
  }

  return null;
}

export async function getConversionLeads(
  user: User,
  options: {
    tab: QualificationTab;
    period: PeriodOption;
    clientId?: string | null;
    page?: number;
  },
): Promise<ConversionLeadsResult> {
  const page = Math.max(1, options.page ?? 1);
  const empty: ConversionLeadsResult = {
    leads: [],
    summary: {
      total: 0,
      pending: 0,
      qualified: 0,
      discarded: 0,
      qualificationRate: 0,
    },
    totalInTab: 0,
    page,
    pageSize: LEADS_PAGE_SIZE,
    hasMore: false,
  };

  const resolved = await resolveReadClient(user);

  if (!resolved) {
    return {
      ...empty,
      notice:
        "Não foi possível ler os leads com a sua sessão. Saia e entre de novo no portal.",
    };
  }

  const { client, enforceClientFilter } = resolved;
  const isAdmin = user.role === "admin";

  // O atalho de sessão de desenvolvimento usa ids que não são UUID; filtrar por
  // eles faria o banco devolver um erro de sintaxe no lugar da tela.
  if (enforceClientFilter && !isUuid(user.clientId)) {
    return {
      ...empty,
      notice:
        "Sessão de desenvolvimento sem cliente real vinculado. Entre com um login do portal para ver os leads.",
    };
  }

  const startDate = resolveStartDate(options.period);
  // Admin pode recortar por cliente; para o cliente o recorte é do banco.
  const clientFilter = isAdmin
    ? options.clientId || null
    : enforceClientFilter
      ? (user.clientId ?? null)
      : null;

  const applyScope = <T extends { gte: (c: string, v: string) => T; eq: (c: string, v: string) => T }>(
    query: T,
  ) => {
    let scoped = query;

    if (startDate) {
      scoped = scoped.gte("criado_em", startDate);
    }

    if (clientFilter) {
      scoped = scoped.eq("client_id", clientFilter);
    }

    return scoped;
  };

  let listQuery = client.from("conversion_leads").select(SELECT_COLUMNS);
  listQuery = applyScope(listQuery);

  if (options.tab !== "todos") {
    listQuery = listQuery.eq("qualificacao", options.tab);
  }

  const from = (page - 1) * LEADS_PAGE_SIZE;
  const [summaryResult, listResult] = await Promise.all([
    client.rpc("conversion_leads_summary", {
      p_start_date: startDate,
      p_client_id: clientFilter,
    }),
    listQuery
      .order("criado_em", { ascending: false })
      .range(from, from + LEADS_PAGE_SIZE),
  ]);

  const summaryRow = Array.isArray(summaryResult.data)
    ? summaryResult.data[0]
    : summaryResult.data;
  const totalCount = Number(summaryRow?.total ?? 0);
  const pendingCount = Number(summaryRow?.pending ?? 0);
  const qualifiedCount = Number(summaryRow?.qualified ?? 0);
  const discardedCount = Number(summaryRow?.discarded ?? 0);
  const evaluated = qualifiedCount + discardedCount;
  const summary: ConversionSummary = {
    total: totalCount,
    pending: pendingCount,
    qualified: qualifiedCount,
    discarded: discardedCount,
    qualificationRate: evaluated > 0 ? (qualifiedCount / evaluated) * 100 : 0,
  };

  const { data, error } = listResult;

  if (error) {
    return { ...empty, summary, notice: error.message };
  }

  if (summaryResult.error) {
    return { ...empty, notice: summaryResult.error.message };
  }

  const rows = (data as LeadRow[] | null) ?? [];
  // Pediu-se uma linha a mais só para saber se existe próxima página.
  const hasMore = rows.length > LEADS_PAGE_SIZE;

  const totalInTab =
    options.tab === "todos"
      ? summary.total
      : options.tab === "pendente"
        ? summary.pending
        : options.tab === "qualificado"
          ? summary.qualified
          : summary.discarded;

  return {
    leads: rows.slice(0, LEADS_PAGE_SIZE).map((row) => mapLead(row, isAdmin)),
    summary,
    totalInTab,
    page,
    pageSize: LEADS_PAGE_SIZE,
    hasMore,
  };
}
