"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SettingsActionState = {
  success?: string;
  error?: string;
};

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

  const { error } = await adminClient.from("integration_settings").upsert({
    provider: parsed.data.provider,
    enabled,
    config: parsed.data.fields,
    updated_at: new Date().toISOString(),
  });

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
