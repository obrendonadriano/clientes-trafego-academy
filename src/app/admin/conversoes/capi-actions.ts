"use server";

import { revalidatePath } from "next/cache";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// A configuração de CAPI vive atrás de RPCs que exigem um admin AUTENTICADO —
// elas checam o usuário da sessão, então o client de serviço não serve aqui.
// O token de acesso é gravado em schema privado e nunca volta pela API: a tela
// mostra apenas se existe ou não.

export type CapiConfigState = {
  success?: string;
  error?: string;
};

const SEM_SESSAO =
  "Só um administrador logado pode alterar a integração. Saia e entre novamente no portal.";

async function requireAdminClient() {
  const user = await getOptionalCurrentUser();

  if (!user || user.role !== "admin") {
    return null;
  }

  const client = await createSupabaseServerClient();

  if (!client) {
    return null;
  }

  const { data } = await client.auth.getUser();
  return data.user ? client : null;
}

function revalidateCapi() {
  revalidatePath("/admin/conversoes/integracao");
  revalidatePath("/admin/clientes", "layout");
}

export async function saveCapiConfigAction(
  _prevState: CapiConfigState,
  formData: FormData,
): Promise<CapiConfigState> {
  const client = await requireAdminClient();

  if (!client) {
    return { error: SEM_SESSAO };
  }

  const clientId = String(formData.get("clientId") ?? "");

  if (!clientId) {
    return { error: "Cliente não informado." };
  }

  const datasetId = String(formData.get("datasetId") ?? "").trim();
  const pageId = String(formData.get("pageId") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const capiAtivo = formData.get("capiAtivo") === "on";

  if (capiAtivo && (!datasetId || !pageId)) {
    return {
      error:
        "Para ativar o envio, preencha o ID do Dataset e o ID da Página.",
    };
  }

  const { error } = await client.rpc("admin_set_client_capi_config", {
    p_client_id: clientId,
    p_dataset_id: datasetId || null,
    p_page_id: pageId || null,
    // null mantém o token atual; só substitui quando algo foi digitado.
    p_access_token: accessToken || null,
    p_capi_ativo: capiAtivo,
  });

  if (error) {
    return { error: error.message };
  }

  revalidateCapi();
  return { success: "Integração salva." };
}

export async function clearCapiTokenAction(
  _prevState: CapiConfigState,
  formData: FormData,
): Promise<CapiConfigState> {
  const client = await requireAdminClient();

  if (!client) {
    return { error: SEM_SESSAO };
  }

  const clientId = String(formData.get("clientId") ?? "");

  if (!clientId) {
    return { error: "Cliente não informado." };
  }

  const { error } = await client.rpc("admin_clear_client_capi_token", {
    p_client_id: clientId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidateCapi();
  return { success: "Token removido e envio desativado." };
}
