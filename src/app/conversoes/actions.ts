"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dispatchQuietly } from "@/lib/conversions/dispatcher";
import {
  isFunnelStage,
  type FunnelStage,
  type LeadQualification,
} from "@/lib/conversions/shared";

export type ConversionActionState = {
  success?: string;
  error?: string;
};

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

function revalidateConversions() {
  revalidatePath("/admin/conversoes");
  revalidatePath("/dashboard/conversoes");
}

const STAGE_FEEDBACK: Record<FunnelStage, string> = {
  pendente: "Lead devolvido para novos leads.",
  qualificado: "Lead qualificado.",
  fechado: "Veículo comprado registrado.",
};

// Move um ou mais leads de etapa.
//
// O banco é quem decide o que vira evento: mover o cartão só altera
// `qualificacao`. Um marco já confirmado pela Meta não é reenviado quando o
// cartão volta e avança de novo — o estado do Kanban e o estado de entrega da
// CAPI são coisas separadas, e um arrastar não apaga histórico de conversão.
export async function moveLeadsAction(
  leadIds: string[],
  stage: FunnelStage,
): Promise<ConversionActionState> {
  const user = await getOptionalCurrentUser();

  if (!user?.active) {
    return { error: "Sessão expirada. Entre no portal novamente." };
  }

  if (!isFunnelStage(stage)) {
    return { error: "Etapa inválida." };
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
    return { error: "Não foi possível gravar com a sua sessão. Entre de novo." };
  }

  // Só `qualificacao` vai no update: um gatilho no banco recusa a alteração de
  // qualquer outra coluna, e `qualificado_por`/`qualificado_em` são dele.
  let query = client
    .from("conversion_leads")
    .update({ qualificacao: stage satisfies LeadQualification })
    .in("id", ids)
    .neq("qualificacao", stage);

  if (user.role !== "admin") {
    query = query.eq(
      "client_id",
      user.clientId ?? "00000000-0000-0000-0000-000000000000",
    );
  }

  const { data, error } = await query.select("id");

  if (error) {
    return { error: error.message };
  }

  revalidateConversions();

  if (!data?.length) {
    return {
      error:
        "Nenhum lead foi alterado: ele já estava nesta etapa, sumiu ou você não tem acesso. Atualize a página.",
    };
  }

  // Envia o que acabou de entrar na fila sem segurar a resposta do Kanban.
  after(() => dispatchQuietly());

  return {
    success:
      data.length === 1
        ? STAGE_FEEDBACK[stage]
        : `${data.length} leads: ${STAGE_FEEDBACK[stage].toLowerCase()}`,
  };
}

// Valor pago pelo veículo: custo de aquisição que fica no CRM. Não é exigido
// para mover o cartão, não é receita e nunca é enviado à Meta.
export async function saveAcquisitionCostAction(
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
    return { error: "Informe um valor maior que zero." };
  }

  const normalizedCurrency = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    return { error: "Moeda inválida." };
  }

  const client = await resolveWriteClient();

  if (!client) {
    return { error: "Não foi possível gravar com a sua sessão. Entre de novo." };
  }

  let query = client
    .from("conversion_leads")
    .update({
      qualificacao: "fechado" satisfies LeadQualification,
      valor: value,
      moeda: normalizedCurrency,
    })
    .eq("id", leadId);

  if (user.role !== "admin") {
    query = query.eq(
      "client_id",
      user.clientId ?? "00000000-0000-0000-0000-000000000000",
    );
  }

  const { data, error } = await query.select("id");

  if (error) {
    return { error: error.message };
  }

  if (!data?.length) {
    return { error: "Lead não encontrado ou sem permissão. Atualize a página." };
  }

  revalidateConversions();
  after(() => dispatchQuietly());

  return { success: "Veículo comprado registrado." };
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
    return { error: "Não foi possível gravar com a sua sessão. Entre de novo." };
  }

  if (!UUID_PATTERN.test(leadId) || note.length > 5000) {
    return { error: "Lead ou observação inválida." };
  }

  const trimmed = note.trim();

  let query = client
    .from("conversion_leads")
    .update({ observacao: trimmed.length > 0 ? trimmed : null })
    .eq("id", leadId);

  if (user.role !== "admin") {
    query = query.eq(
      "client_id",
      user.clientId ?? "00000000-0000-0000-0000-000000000000",
    );
  }

  const { data, error } = await query.select("id");

  if (error) {
    return { error: error.message };
  }

  if (!data?.length) {
    return { error: "Lead não encontrado ou sem permissão." };
  }

  revalidateConversions();
  return { success: "Observação salva." };
}
