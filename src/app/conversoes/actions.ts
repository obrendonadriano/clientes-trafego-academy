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

// O texto do fechamento depende do modelo do cliente e quem sabe disso é a
// tela, que conhece o lead. Aqui fica só o que vale para os dois modelos.
const STAGE_FEEDBACK: Record<FunnelStage, string> = {
  pendente: "Lead devolvido para novos leads.",
  qualificado: "Lead qualificado.",
  fechado: "Fechamento registrado.",
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

// Registra o fechamento com valor.
//
// O significado do valor depende do modelo do cliente, e quem decide isso é o
// banco — não este arquivo:
//   vehicle_acquisition  custo de aquisição. Fica no CRM, nunca vai à Meta.
//   sale                 receita da venda. Vira custom_data do Purchase.
//
// Para quem vende, o valor é obrigatório: o gatilho recusa o fechamento sem
// ele. A validação aqui é a primeira barreira, não a única.
export async function registerClosedDealAction(
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

  // Dinheiro é gravado com duas casas: nada de centavo fracionado vindo de
  // uma conversão de vírgula mal feita no navegador.
  const amount = Math.round(value * 100) / 100;

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
      valor: amount,
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

  return { success: "Fechamento registrado." };
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
