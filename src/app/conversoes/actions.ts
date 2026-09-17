"use server";

import { revalidatePath } from "next/cache";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { isDevelopmentAuthFallbackEnabled } from "@/lib/auth/mode";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LeadQualification } from "@/lib/conversions/shared";

export type ConversionActionState = {
  success?: string;
  error?: string;
};

const QUALIFICATIONS: LeadQualification[] = [
  "pendente",
  "qualificado",
  "desqualificado",
  "fechado",
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Escrita sempre pela sessão do usuário: é ela que o banco usa para preencher
// `qualificado_por` e para aplicar as policies. O caminho de serviço existe só
// como atalho de desenvolvimento (sessão mock, sem login no Supabase).
async function resolveWriteClient() {
  const serverClient = await createSupabaseServerClient();

  if (serverClient) {
    const { data } = await serverClient.auth.getUser();

    if (data.user) {
      return serverClient;
    }
  }

  if (isDevelopmentAuthFallbackEnabled() && isSupabaseAdminConfigured()) {
    return createSupabaseAdminClient();
  }

  return null;
}

export async function closeLeadAction(
  leadId: string,
  value: number,
  currency = "BRL",
): Promise<ConversionActionState> {
  const user = await getOptionalCurrentUser();

  if (!user) {
    return { error: "Sessão expirada. Entre no portal novamente." };
  }

  if (!UUID_PATTERN.test(leadId)) {
    return { error: "Lead inválido." };
  }

  if (!Number.isFinite(value) || value <= 0 || value > 999_999_999) {
    return { error: "Informe um valor de venda válido e maior que zero." };
  }

  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    return { error: "Moeda inválida." };
  }

  const client = await resolveWriteClient();
  if (!client) {
    return { error: "Não foi possível gravar com a sua sessão. Entre de novo." };
  }

  const { error } = await client
    .from("conversion_leads")
    .update({
      qualificacao: "fechado" satisfies LeadQualification,
      valor: value,
      moeda: normalizedCurrency,
    })
    .eq("id", leadId);

  if (error) {
    return { error: error.message };
  }

  revalidateConversions();
  return {
    success:
      "Negócio fechado registrado. Com o identificador do anúncio, a compra entra na fila da Meta.",
  };
}

function revalidateConversions() {
  revalidatePath("/admin/conversoes");
  revalidatePath("/dashboard/conversoes");
}

export async function qualifyLeadsAction(
  leadIds: string[],
  qualification: LeadQualification,
): Promise<ConversionActionState> {
  const user = await getOptionalCurrentUser();

  if (!user) {
    return { error: "Sessão expirada. Entre no portal novamente." };
  }

  if (!QUALIFICATIONS.includes(qualification)) {
    return { error: "Marcação inválida." };
  }

  const ids = [...new Set(leadIds.filter(Boolean))];

  if (ids.length === 0) {
    return { error: "Selecione ao menos um lead." };
  }

  const client = await resolveWriteClient();

  if (!client) {
    return { error: "Não foi possível gravar com a sua sessão. Entre de novo." };
  }

  // Só `qualificacao` vai no update: um gatilho no banco recusa a alteração de
  // qualquer outra coluna, e `qualificado_por`/`qualificado_em` são dele.
  const { error } = await client
    .from("conversion_leads")
    .update({ qualificacao: qualification })
    .in("id", ids);

  if (error) {
    return { error: error.message };
  }

  revalidateConversions();

  const label =
    qualification === "qualificado"
      ? "qualificado"
      : qualification === "desqualificado"
        ? "desqualificado"
        : qualification === "fechado"
          ? "marcado como negócio fechado"
          : "voltou para pendente";

  return {
    success:
      ids.length === 1
        ? `Lead ${label}.`
        : `${ids.length} leads: ${label}.`,
  };
}

export async function saveLeadNoteAction(
  leadId: string,
  note: string,
): Promise<ConversionActionState> {
  const user = await getOptionalCurrentUser();

  if (!user) {
    return { error: "Sessão expirada. Entre no portal novamente." };
  }

  const client = await resolveWriteClient();

  if (!client) {
    return { error: "Não foi possível gravar com a sua sessão. Entre de novo." };
  }

  const trimmed = note.trim();

  const { error } = await client
    .from("conversion_leads")
    .update({ observacao: trimmed.length > 0 ? trimmed : null })
    .eq("id", leadId);

  if (error) {
    return { error: error.message };
  }

  revalidateConversions();
  return { success: "Observação salva." };
}
