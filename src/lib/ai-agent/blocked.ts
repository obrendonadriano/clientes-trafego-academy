import "server-only";

import { AiAgentError, aiAdminClient } from "./store";
import { whatsappNumberVariants } from "./shared";

export type AiBlockedNumber = {
  id: string;
  whatsappNumber: string;
  label: string | null;
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  whatsapp_number: string;
  label: string | null;
  blocked: boolean;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, whatsapp_number, label, blocked, created_at, updated_at";

const toBlockedNumber = (row: Row): AiBlockedNumber => ({
  id: row.id,
  whatsappNumber: row.whatsapp_number,
  label: row.label,
  blocked: row.blocked,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Unique (client_id, whatsapp_number) violado: mensagem clara em vez de erro cru.
function failure(error: { code?: string } | null, fallback: string): never {
  if (error?.code === "23505") {
    throw new AiAgentError("Este número já está na lista.", 409);
  }
  throw new AiAgentError(fallback);
}

export async function listBlockedNumbers(clientId: string) {
  const { data, error } = await aiAdminClient()
    .from("ai_blocked_numbers")
    .select(COLUMNS)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) failure(error, "Não foi possível carregar os números bloqueados.");
  return ((data as Row[] | null) ?? []).map(toBlockedNumber);
}

/** A IA não responde nem registra conversa com um número bloqueado. */
export async function isNumberBlocked(clientId: string, number: string) {
  const { data, error } = await aiAdminClient()
    .from("ai_blocked_numbers")
    .select("id")
    .eq("client_id", clientId)
    .eq("blocked", true)
    .in("whatsapp_number", whatsappNumberVariants(number))
    .limit(1);

  if (error) failure(error, "Não foi possível verificar os números bloqueados.");
  return Boolean(data?.length);
}

export async function addBlockedNumber(
  clientId: string,
  input: { whatsappNumber: string; label: string | null },
) {
  const { error } = await aiAdminClient().from("ai_blocked_numbers").insert({
    client_id: clientId,
    whatsapp_number: input.whatsappNumber,
    label: input.label,
    blocked: true,
  });

  if (error) failure(error, "Não foi possível bloquear o número.");
}

export async function updateBlockedNumber(
  clientId: string,
  id: string,
  values: { whatsappNumber?: string; label?: string | null; blocked?: boolean },
) {
  const { data, error } = await aiAdminClient()
    .from("ai_blocked_numbers")
    .update({
      ...(values.whatsappNumber !== undefined
        ? { whatsapp_number: values.whatsappNumber }
        : {}),
      ...(values.label !== undefined ? { label: values.label } : {}),
      ...(values.blocked !== undefined ? { blocked: values.blocked } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .eq("id", id)
    .select("id");

  if (error) failure(error, "Não foi possível atualizar o número.");
  if (!data?.length) throw new AiAgentError("Número não encontrado.", 404);
}

export async function deleteBlockedNumber(clientId: string, id: string) {
  const { data, error } = await aiAdminClient()
    .from("ai_blocked_numbers")
    .delete()
    .eq("client_id", clientId)
    .eq("id", id)
    .select("id");

  if (error) failure(error, "Não foi possível excluir o número.");
  if (!data?.length) throw new AiAgentError("Número não encontrado.", 404);
}
