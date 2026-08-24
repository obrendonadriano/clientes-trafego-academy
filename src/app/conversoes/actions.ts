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
];

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
        ? "descartado"
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
