"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  createMetaAdAccount,
  deleteMetaAdAccount,
  updateMetaAdAccount,
} from "@/lib/meta/accounts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SettingsActionState = {
  success?: string;
  error?: string;
};

export type MetaAccountActionState = {
  success?: string;
  error?: string;
};

const adAccountIdField = z
  .string()
  .min(2, "Informe o ID da conta de anúncio.")
  .regex(/^(act_)?\d+$/i, "O ID deve ser numérico (ex.: 123456789 ou act_123456789).");

const metaAccountSchema = z.object({
  label: z.string().min(2, "Dê um apelido para identificar a conta."),
  adAccountId: adAccountIdField,
  accessToken: z.string().optional(),
});

function normalizeAdAccountId(value: string) {
  const digits = value.replace(/^act_/i, "");
  return `act_${digits}`;
}

export async function addMetaAccountAction(
  _prevState: MetaAccountActionState,
  formData: FormData,
): Promise<MetaAccountActionState> {
  const parsed = metaAccountSchema.safeParse({
    label: formData.get("label"),
    adAccountId: formData.get("adAccountId"),
    accessToken: formData.get("accessToken"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  try {
    await createMetaAdAccount({
      label: parsed.data.label.trim(),
      adAccountId: normalizeAdAccountId(parsed.data.adAccountId),
      accessToken: parsed.data.accessToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar a conta.";

    if (message.toLowerCase().includes("duplicate") || message.includes("23505")) {
      return { error: "Esta conta de anúncio já foi cadastrada." };
    }

    return { error: message };
  }

  updateTag("campaigns");
  revalidatePath("/admin/configuracoes");
  return { success: `Conta "${parsed.data.label.trim()}" adicionada com sucesso.` };
}

export async function toggleMetaAccountAction(
  _prevState: MetaAccountActionState,
  formData: FormData,
): Promise<MetaAccountActionState> {
  const id = String(formData.get("id") ?? "");
  const enabled = formData.get("enabled") === "true";

  if (!id) {
    return { error: "Conta inválida." };
  }

  try {
    await updateMetaAdAccount(id, { enabled });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar a conta." };
  }

  revalidatePath("/admin/configuracoes");
  return { success: enabled ? "Conta ativada." : "Conta desativada." };
}

export async function removeMetaAccountAction(
  _prevState: MetaAccountActionState,
  formData: FormData,
): Promise<MetaAccountActionState> {
  const id = String(formData.get("id") ?? "");

  if (!id) {
    return { error: "Conta inválida." };
  }

  try {
    await deleteMetaAdAccount(id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover a conta." };
  }

  updateTag("campaigns");
  revalidatePath("/admin/configuracoes");
  return { success: "Conta removida." };
}

const integrationSchema = z.object({
  provider: z.enum(["meta_ads", "gemini"]),
  enabled: z.string().optional(),
  fields: z.record(z.string(), z.string()),
});

export async function saveIntegrationSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return {
      error:
        "As configurações persistentes dependem do Supabase configurado com service role.",
    };
  }

  const provider = String(formData.get("provider") ?? "");
  const enabled = formData.get("enabled") === "on";

  const fields = Object.fromEntries(
    Array.from(formData.entries())
      .filter(([key]) => key.startsWith("config_"))
      .map(([key, value]) => [key.replace("config_", ""), String(value)]),
  );

  const parsed = integrationSchema.safeParse({
    provider,
    enabled: enabled ? "on" : undefined,
    fields,
  });

  if (!parsed.success) {
    return { error: "Não foi possível validar a configuração enviada." };
  }

  const payload = {
    provider: parsed.data.provider,
    enabled,
    config: parsed.data.fields,
    updated_at: new Date().toISOString(),
  };

  const existing = await adminClient
    .from("integration_settings")
    .select("id")
    .eq("provider", parsed.data.provider)
    .maybeSingle();

  if (existing.error) {
    return { error: existing.error.message };
  }

  const { error } = existing.data
    ? await adminClient
        .from("integration_settings")
        .update(payload)
        .eq("id", existing.data.id)
    : await adminClient.from("integration_settings").insert(payload);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/configuracoes");
  return {
    success: enabled
      ? "Credenciais salvas e integração ativada com sucesso."
      : "Credenciais salvas com sucesso. A integração permanece desativada até você ativar.",
  };
}
