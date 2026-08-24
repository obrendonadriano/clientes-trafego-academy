import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WhatsappSessionStatus } from "@/lib/whatsapp-session";

export type WhatsappSessionRecord = {
  client_id: string;
  session_name: string | null;
  status: string | null;
  phone_number: string | null;
  push_name: string | null;
  conectado_em: string | null;
  desconectado_em: string | null;
  ultimo_erro: string | null;
};

const SESSION_RECORD_COLUMNS =
  "client_id, session_name, status, phone_number, push_name, conectado_em, desconectado_em, ultimo_erro";

export class WhatsappApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "WhatsappApiError";
    this.status = status;
  }
}

function adminClientOrThrow() {
  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    throw new WhatsappApiError("A conexão segura com o banco não está configurada.", 503);
  }
  return adminClient;
}

export async function authenticateWhatsappRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new WhatsappApiError("Sua sessão expirou. Entre novamente no portal.", 401);
  }

  const adminClient = adminClientOrThrow();
  const { data: authData, error: authError } = await adminClient.auth.getUser(match[1]);

  if (authError || !authData.user) {
    throw new WhatsappApiError("Sua sessão expirou. Entre novamente no portal.", 401);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("role, ativo, client_id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.role !== "client" ||
    !profile.ativo ||
    !profile.client_id
  ) {
    throw new WhatsappApiError(
      "Este usuário não está vinculado a um cliente ativo.",
      403,
    );
  }

  return { clientId: profile.client_id as string };
}

export async function getWhatsappSessionRecord(clientId: string) {
  const adminClient = adminClientOrThrow();
  const { data, error } = await adminClient
    .from("whatsapp_sessions")
    .select(SESSION_RECORD_COLUMNS)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new WhatsappApiError("Não foi possível consultar a conexão do WhatsApp.");
  }

  return (data as WhatsappSessionRecord | null) ?? null;
}

function sessionNameForClient(clientId: string) {
  const digest = createHash("sha256").update(clientId).digest("hex");
  return `ta_${digest.slice(0, 24)}`;
}

export async function ensureWhatsappSessionRecord(clientId: string) {
  const current = await getWhatsappSessionRecord(clientId);
  if (current?.session_name) {
    return current;
  }

  const adminClient = adminClientOrThrow();
  const sessionName = sessionNameForClient(clientId);
  const write = current
    ? await adminClient
        .from("whatsapp_sessions")
        .update({ session_name: sessionName, status: "STARTING", ultimo_erro: null })
        .eq("client_id", clientId)
    : await adminClient.from("whatsapp_sessions").insert({
        client_id: clientId,
        session_name: sessionName,
        status: "STARTING",
      });

  if (write.error && write.error.code !== "23505") {
    throw new WhatsappApiError("Não foi possível preparar a sessão do WhatsApp.");
  }

  const saved = await getWhatsappSessionRecord(clientId);
  if (!saved?.session_name) {
    throw new WhatsappApiError("Não foi possível preparar a sessão do WhatsApp.");
  }

  return saved;
}

export async function updateWhatsappSessionRecord(
  clientId: string,
  values: Partial<{
    status: WhatsappSessionStatus;
    phone_number: string | null;
    push_name: string | null;
    conectado_em: string | null;
    desconectado_em: string | null;
    ultimo_erro: string | null;
    ultimo_evento_em: string;
  }>,
) {
  const adminClient = adminClientOrThrow();
  const { error } = await adminClient
    .from("whatsapp_sessions")
    .update(values)
    .eq("client_id", clientId);

  if (error) {
    throw new WhatsappApiError("Não foi possível atualizar a conexão do WhatsApp.");
  }
}

export async function getWhatsappSessionByName(sessionName: string) {
  const adminClient = adminClientOrThrow();
  const { data, error } = await adminClient
    .from("whatsapp_sessions")
    .select(SESSION_RECORD_COLUMNS)
    .eq("session_name", sessionName)
    .maybeSingle();

  if (error) {
    throw new WhatsappApiError("Não foi possível localizar a sessão do WhatsApp.");
  }

  return (data as WhatsappSessionRecord | null) ?? null;
}

export function whatsappErrorResponse(error: unknown) {
  const status = error instanceof WhatsappApiError ? error.status : 500;
  const message = error instanceof Error
    ? error.message
    : "Não foi possível concluir esta operação.";
  return Response.json({ error: message }, { status });
}
