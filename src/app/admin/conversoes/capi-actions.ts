"use server";

import { revalidatePath } from "next/cache";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// A action autentica e autoriza o admin; só então usa o client server-only para
// chamar RPCs que não são executáveis por anon/authenticated. O token fica no
// schema privado e nunca volta pela API.

export type CapiConfigState = {
  success?: string;
  error?: string;
};

const SEM_SESSAO =
  "Só um administrador logado pode alterar a integração. Saia e entre novamente no portal.";

async function requireAdminClient() {
  const user = await getOptionalCurrentUser();

  if (!user || user.role !== "admin" || !user.active) {
    return null;
  }

  return createSupabaseAdminClient();
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
  const wabaId = String(formData.get("wabaId") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const capiAtivo = formData.get("capiAtivo") === "on";

  if (datasetId && !/^\d{5,30}$/.test(datasetId)) {
    return { error: "O ID do Dataset deve conter apenas números." };
  }

  if (wabaId && !/^\d{5,30}$/.test(wabaId)) {
    return { error: "O WABA ID deve conter apenas números." };
  }

  if (capiAtivo && (!datasetId || !wabaId)) {
    return {
      error:
        "Para ativar o envio, preencha o ID do Dataset e o WABA ID.",
    };
  }

  const { error } = await client.rpc("admin_set_client_capi_config", {
    p_client_id: clientId,
    p_dataset_id: datasetId || null,
    p_waba_id: wabaId || null,
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
