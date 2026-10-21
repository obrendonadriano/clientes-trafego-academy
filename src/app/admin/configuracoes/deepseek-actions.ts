"use server";

import { revalidatePath } from "next/cache";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { getIntegrationSettingByProvider } from "@/lib/integrations";
import {
  getDeepseekRuntimeConfig,
  listDeepseekModels,
  probeDeepseekModel,
} from "@/lib/services/deepseek";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Troca do modelo do DeepSeek usado pelo Atendimento IA, SEM informar a API
// Key de novo: usa a chave já salva no servidor, que nunca vai ao navegador.
// Só o campo `model` de integration_settings muda.

export type DeepseekModelsState = {
  models?: string[];
  current?: string;
  error?: string;
};

export type DeepseekModelSaveState = {
  success?: string;
  error?: string;
};

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,99}$/;

async function isActiveAdmin() {
  const user = await getOptionalCurrentUser();
  return Boolean(user && user.role === "admin" && user.active);
}

async function currentModel() {
  const saved = await getIntegrationSettingByProvider("deepseek");
  return saved?.config?.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
}

export async function listDeepseekModelsAction(): Promise<DeepseekModelsState> {
  if (!(await isActiveAdmin())) {
    return { error: "Só um administrador pode ver os modelos." };
  }

  const config = await getDeepseekRuntimeConfig();
  if (!config) {
    return { error: "Salve a API Key do DeepSeek antes de escolher o modelo." };
  }

  try {
    const models = await listDeepseekModels(config.apiKey);
    return { models, current: await currentModel() };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível consultar os modelos do DeepSeek.",
      current: await currentModel(),
    };
  }
}

export async function saveDeepseekModelAction(
  _previous: DeepseekModelSaveState,
  formData: FormData,
): Promise<DeepseekModelSaveState> {
  if (!(await isActiveAdmin())) {
    return { error: "Só um administrador pode trocar o modelo." };
  }

  const model = String(formData.get("model") ?? "").trim();
  if (!MODEL_ID.test(model)) {
    return { error: "Informe o nome do modelo como o DeepSeek mostra (ex.: deepseek-chat)." };
  }

  const config = await getDeepseekRuntimeConfig();
  if (!config) {
    return { error: "Salve a API Key do DeepSeek antes de escolher o modelo." };
  }

  // O modelo precisa existir na conta e responder no formato do atendimento.
  try {
    const available = await listDeepseekModels(config.apiKey);
    if (available.length && !available.includes(model)) {
      return { error: `O DeepSeek não oferece o modelo "${model}" para esta chave.` };
    }
    await probeDeepseekModel({ apiKey: config.apiKey, model });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Modelo não salvo: ${error.message}`
          : "Modelo não salvo: o teste com o DeepSeek falhou.",
    };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { error: "As configurações dependem do Supabase com service role." };
  }

  const existing = await admin
    .from("integration_settings")
    .select("id, config")
    .eq("provider", "deepseek")
    .maybeSingle();

  if (existing.error) {
    return { error: "Não foi possível ler a configuração do DeepSeek." };
  }

  // Mantém a chave e todo o resto; só troca o modelo.
  const nextConfig = {
    ...((existing.data?.config ?? {}) as Record<string, string>),
    model,
  };

  const { error } = existing.data
    ? await admin
        .from("integration_settings")
        .update({ config: nextConfig, updated_at: new Date().toISOString() })
        .eq("id", existing.data.id)
    : await admin.from("integration_settings").insert({
        provider: "deepseek",
        // Sem linha salva, a chave vem do ambiente; não muda o "ativado".
        enabled: false,
        config: nextConfig,
        updated_at: new Date().toISOString(),
      });

  if (error) {
    return { error: "Não foi possível salvar o modelo." };
  }

  revalidatePath("/admin/configuracoes");
  return { success: `Modelo ${model} testado e salvo. Vale a partir da próxima mensagem.` };
}
