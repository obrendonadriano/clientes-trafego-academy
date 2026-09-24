import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import {
  getEmbeddedSignupReadiness,
  type EmbeddedSignupReadiness,
} from "@/lib/meta/conversions-config";
import type {
  ClientConnection,
  ConnectionStatus,
} from "@/lib/conversions/connection-shared";
import {
  toConversionGoalType,
  type ConversionGoalType,
} from "@/lib/conversions/shared";
import type { User } from "@/lib/types";

// Leitura da conexão oficial. A do cliente passa pela sessão autenticada, para
// que a RLS continue sendo a barreira; a do administrador usa a RPC de
// diagnóstico, que roda com service_role e nunca devolve o token.

const CONNECTION_COLUMNS =
  "status, display_phone_number, verified_name, is_on_biz_app, dataset_id, connected_at";

type ConnectionRow = {
  status: ConnectionStatus | null;
  display_phone_number: string | null;
  verified_name: string | null;
  is_on_biz_app: boolean | null;
  dataset_id: string | null;
  connected_at: string | null;
};

const NOT_CONNECTED: ClientConnection = {
  status: "not_connected",
  phone: null,
  verifiedName: null,
  connectedAt: null,
  keepsBusinessApp: null,
  trackingReady: false,
};

export type ClientConnectionView = {
  connection: ClientConnection;
  signup: EmbeddedSignupReadiness;
  notice?: string;
};

export async function getClientWhatsappConnection(
  user: User,
): Promise<ClientConnectionView> {
  const signup = await getEmbeddedSignupReadiness();

  if (!user.clientId) {
    return { connection: NOT_CONNECTED, signup };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { connection: NOT_CONNECTED, signup };
  }

  const { data, error } = await supabase
    .from("client_whatsapp_connections")
    .select(CONNECTION_COLUMNS)
    .eq("client_id", user.clientId)
    .maybeSingle<ConnectionRow>();

  if (error) {
    return { connection: NOT_CONNECTED, signup, notice: error.message };
  }

  if (!data) {
    return { connection: NOT_CONNECTED, signup };
  }

  return {
    signup,
    connection: {
      status: data.status ?? "not_connected",
      phone: data.display_phone_number,
      verifiedName: data.verified_name,
      connectedAt: data.connected_at,
      keepsBusinessApp: data.is_on_biz_app,
      trackingReady: Boolean(data.dataset_id) && data.status === "active",
    },
  };
}

export type AdminConnectionRow = {
  clientId: string;
  clientName: string;
  datasetId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  status: ConnectionStatus;
  isOnBizApp: boolean | null;
  platformType: string | null;
  webhookSubscribed: boolean;
  lastWebhookAt: string | null;
  lastLeadAt: string | null;
  lastConversionAt: string | null;
  lastError: string | null;
  capiAtivo: boolean;
  tokenConfigurado: boolean;
  leadsPendentes: number;
  leadsNaFila: number;
  eventosComErro: number;
  // De onde vêm os leads deste cliente durante a migração.
  ingestMode: "legacy_waha" | "official_meta";
  // Modelo de conversão: decide o evento do fechamento.
  goalType: ConversionGoalType;
};

export type AdminConnectionOverview = {
  clients: AdminConnectionRow[];
  signup: EmbeddedSignupReadiness;
  notice?: string;
};

type StatusRow = {
  client_id: string;
  nome_empresa: string | null;
  meta_dataset_id: string | null;
  meta_waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  connection_status: string | null;
  is_on_biz_app: boolean | null;
  platform_type: string | null;
  webhook_subscribed: boolean | null;
  last_webhook_at: string | null;
  last_lead_at: string | null;
  last_conversion_at: string | null;
  last_error: string | null;
  capi_ativo: boolean | null;
  token_configurado: boolean | null;
  leads_pendentes: number | null;
  leads_na_fila: number | null;
  eventos_com_erro: number | null;
  ingest_mode: string | null;
  goal_type: string | null;
};

export async function getAdminConnectionOverview(): Promise<AdminConnectionOverview> {
  const signup = await getEmbeddedSignupReadiness();
  const user = await getOptionalCurrentUser();
  const admin = createSupabaseAdminClient();

  // A RPC só aceita service_role; a autorização do administrador é feita aqui,
  // antes de usar o client de serviço.
  if (user?.role !== "admin" || !user.active || !admin) {
    return {
      clients: [],
      signup,
      notice: "Entre com um usuário administrador para ver o diagnóstico.",
    };
  }

  const { data, error } = await admin.rpc("admin_client_capi_status");

  if (error) {
    return { clients: [], signup, notice: error.message };
  }

  return {
    signup,
    clients: ((data as StatusRow[] | null) ?? []).map((row) => ({
      clientId: row.client_id,
      clientName: row.nome_empresa ?? "Sem nome",
      datasetId: row.meta_dataset_id,
      wabaId: row.meta_waba_id,
      phoneNumberId: row.phone_number_id,
      displayPhoneNumber: row.display_phone_number,
      status: (row.connection_status as ConnectionStatus) ?? "not_connected",
      isOnBizApp: row.is_on_biz_app,
      platformType: row.platform_type,
      webhookSubscribed: Boolean(row.webhook_subscribed),
      lastWebhookAt: row.last_webhook_at,
      lastLeadAt: row.last_lead_at,
      lastConversionAt: row.last_conversion_at,
      lastError: row.last_error,
      capiAtivo: Boolean(row.capi_ativo),
      tokenConfigurado: Boolean(row.token_configurado),
      leadsPendentes: Number(row.leads_pendentes ?? 0),
      leadsNaFila: Number(row.leads_na_fila ?? 0),
      eventosComErro: Number(row.eventos_com_erro ?? 0),
      ingestMode:
        row.ingest_mode === "official_meta" ? "official_meta" : "legacy_waha",
      goalType: toConversionGoalType(row.goal_type),
    })),
  };
}
