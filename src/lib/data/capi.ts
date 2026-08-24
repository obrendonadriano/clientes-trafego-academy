import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDevelopmentAuthFallbackEnabled } from "@/lib/auth/mode";
import { isSupabaseAdminConfigured } from "@/lib/env";

// Diagnóstico da integração por cliente. Vem da RPC `admin_client_capi_status`,
// que exige um admin autenticado — o token em si nunca é devolvido, só o
// indicador de que existe.

export type ClientCapiStatus = {
  clientId: string;
  clientName: string;
  datasetId: string | null;
  pageId: string | null;
  capiAtivo: boolean;
  tokenConfigurado: boolean;
  leadsPendentes: number;
  leadsNaFila: number;
};

export type CapiOverview = {
  clients: ClientCapiStatus[];
  notice?: string;
};

type StatusRow = {
  client_id: string;
  nome_empresa: string | null;
  meta_dataset_id: string | null;
  meta_page_id: string | null;
  capi_ativo: boolean | null;
  token_configurado: boolean | null;
  leads_pendentes: number | null;
  leads_na_fila: number | null;
};

function mapRow(row: StatusRow): ClientCapiStatus {
  return {
    clientId: row.client_id,
    clientName: row.nome_empresa ?? "Sem nome",
    datasetId: row.meta_dataset_id,
    pageId: row.meta_page_id,
    capiAtivo: Boolean(row.capi_ativo),
    tokenConfigurado: Boolean(row.token_configurado),
    leadsPendentes: Number(row.leads_pendentes ?? 0),
    leadsNaFila: Number(row.leads_na_fila ?? 0),
  };
}

export async function getCapiOverview(): Promise<CapiOverview> {
  const client = await createSupabaseServerClient();

  if (client) {
    const { data: session } = await client.auth.getUser();

    if (session.user) {
      const { data, error } = await client.rpc("admin_client_capi_status");

      if (error) {
        return { clients: [], notice: error.message };
      }

      return { clients: ((data as StatusRow[] | null) ?? []).map(mapRow) };
    }
  }

  // Sem sessão Supabase a RPC recusa (ela identifica o admin pelo usuário
  // logado). Em desenvolvimento, com o atalho de sessão mock, monta-se uma
  // visão equivalente a partir das colunas públicas — o token continua
  // inacessível, então aqui ele aparece como desconhecido.
  if (isDevelopmentAuthFallbackEnabled() && isSupabaseAdminConfigured()) {
    const adminClient = createSupabaseAdminClient();

    if (adminClient) {
      const [{ data: clients }, { data: leads }] = await Promise.all([
        adminClient
          .from("clients")
          .select("id, nome_empresa, meta_dataset_id, meta_page_id, capi_ativo")
          .order("nome_empresa"),
        adminClient
          .from("conversion_leads")
          .select("client_id, qualificacao, capi_status"),
      ]);

      const pendentes = new Map<string, number>();
      const naFila = new Map<string, number>();

      for (const lead of leads ?? []) {
        if (lead.qualificacao === "pendente") {
          pendentes.set(lead.client_id, (pendentes.get(lead.client_id) ?? 0) + 1);
        }

        if (lead.qualificacao === "qualificado" && lead.capi_status === "nao_enviado") {
          naFila.set(lead.client_id, (naFila.get(lead.client_id) ?? 0) + 1);
        }
      }

      return {
        notice:
          "Sessão de desenvolvimento: o indicador de token não é lido aqui. Entre com um login real para ver o estado completo.",
        clients: (clients ?? []).map((row) => ({
          clientId: row.id,
          clientName: row.nome_empresa ?? "Sem nome",
          datasetId: row.meta_dataset_id,
          pageId: row.meta_page_id,
          capiAtivo: Boolean(row.capi_ativo),
          tokenConfigurado: false,
          leadsPendentes: pendentes.get(row.id) ?? 0,
          leadsNaFila: naFila.get(row.id) ?? 0,
        })),
      };
    }
  }

  return {
    clients: [],
    notice:
      "Entre com um usuário administrador para ver o estado da integração.",
  };
}

// Estado de um cliente só, para o card na tela de perfil.
export async function getClientCapiConfig(clientId: string) {
  const overview = await getCapiOverview();
  const found = overview.clients.find((item) => item.clientId === clientId);

  return {
    clientId,
    datasetId: found?.datasetId ?? "",
    pageId: found?.pageId ?? "",
    capiAtivo: found?.capiAtivo ?? false,
    tokenConfigurado: found?.tokenConfigurado ?? false,
  };
}
