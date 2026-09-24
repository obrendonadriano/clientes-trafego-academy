"use server";

import { revalidatePath } from "next/cache";
import { getOptionalCurrentUser } from "@/lib/auth/session";
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Escrita sempre pela sessão real: a RLS e os gatilhos usam seu JWT. Uma sessão
// mock nunca deve alterar leads reais ou gerar eventos externos.
async function resolveWriteClient() {
  const serverClient = await createSupabaseServerClient();

  if (serverClient) {
    const { data } = await serverClient.auth.getUser();

    if (data.user) {
      return serverClient;
    }
  }

  return null;
}

export async function closeLeadAction(
  leadId: string,
  value: number,
  currency = "BRL",
): Promise<ConversionActionState> {
  const user = await getOptionalCurrentUser();

  if (!user?.active) {
    return { error: "Sessão expirada. Entre no portal novamente." };
  }

  if (!UUID_PATTERN.test(leadId)) {
    return { error: "Lead inválido." };
  }

  if (!Number.isFinite(value) || value <= 0 || value > 999_999_999) {
    return { error: "Informe o valor pago pelo veículo, maior que zero." };
  }

  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    return { error: "Moeda inválida." };
  }

  const client = await resolveWriteClient();
  if (!client) {
    return {
      error: "Não foi possível gravar com a sua sessão. Entre de novo.",
    };
  }

  // A versão antiga envia Purchase como compra na conversa. O contrato deste
  // funil acontece fora do WhatsApp: não deixar uma instalação antiga enviá-lo.
  const { data: version, error: versionError } = await client.rpc(
    "conversion_pipeline_version",
  );
  if (versionError || version !== 2) {
    return {
      error:
        "O gestor precisa atualizar a integração de conversões antes de registrar a compra do veículo.",
    };
  }

  let query = client
    .from("conversion_leads")
    .update({
      qualificacao: "fechado" satisfies LeadQualification,
      valor: value,
      moeda: normalizedCurrency,
    })
    .eq("id", leadId)
    .neq("qualificacao", "fechado");
  if (user.role !== "admin")
    query = query.eq(
      "client_id",
      user.clientId ?? "00000000-0000-0000-0000-000000000000",
    );
  const { data, error } = await query.select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data?.length)
    return {
      error:
        "Lead não encontrado, sem permissão ou compra já registrada. Atualize a página.",
    };

  revalidateConversions();
  return {
    success:
      "Compra do veículo registrada. O envio do evento depende da integração Meta ativa e dos dados de correspondência.",
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

  if (!user?.active) {
    return { error: "Sessão expirada. Entre no portal novamente." };
  }

  if (!QUALIFICATIONS.includes(qualification)) {
    return { error: "Marcação inválida." };
  }

  const ids = [...new Set(leadIds.filter(Boolean))];

  if (ids.length === 0) {
    return { error: "Selecione ao menos um lead." };
  }
  if (ids.length > 200 || ids.some((id) => !UUID_PATTERN.test(id))) {
    return { error: "Seleção de leads inválida." };
  }

  const client = await resolveWriteClient();

  if (!client) {
    return {
      error: "Não foi possível gravar com a sua sessão. Entre de novo.",
    };
  }

  // Só `qualificacao` vai no update: um gatilho no banco recusa a alteração de
  // qualquer outra coluna, e `qualificado_por`/`qualificado_em` são dele.
  let query = client
    .from("conversion_leads")
    .update({ qualificacao: qualification })
    .in("id", ids);
  if (user.role !== "admin")
    query = query.eq(
      "client_id",
      user.clientId ?? "00000000-0000-0000-0000-000000000000",
    );
  const { data, error } = await query.select("id");

  if (error) {
    return { error: error.message };
  }
  if (data?.length !== ids.length) {
    revalidateConversions();
    return {
      error:
        "Alguns leads não foram alterados por falta de acesso ou porque não existem mais. Atualize a página.",
    };
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
      ids.length === 1 ? `Lead ${label}.` : `${ids.length} leads: ${label}.`,
  };
}

export async function saveLeadNoteAction(
  leadId: string,
  note: string,
): Promise<ConversionActionState> {
  const user = await getOptionalCurrentUser();

  if (!user?.active) {
    return { error: "Sessão expirada. Entre no portal novamente." };
  }

  const client = await resolveWriteClient();

  if (!client) {
    return {
      error: "Não foi possível gravar com a sua sessão. Entre de novo.",
    };
  }

  if (!UUID_PATTERN.test(leadId) || note.length > 5000)
    return { error: "Lead ou observação inválida." };
  const trimmed = note.trim();

  let query = client
    .from("conversion_leads")
    .update({ observacao: trimmed.length > 0 ? trimmed : null })
    .eq("id", leadId);
  if (user.role !== "admin")
    query = query.eq(
      "client_id",
      user.clientId ?? "00000000-0000-0000-0000-000000000000",
    );
  const { data, error } = await query.select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data?.length) return { error: "Lead não encontrado ou sem permissão." };

  revalidateConversions();
  return { success: "Observação salva." };
}
