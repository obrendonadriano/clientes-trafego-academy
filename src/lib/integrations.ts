import type { IntegrationProvider, IntegrationSetting } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getIntegrationSettingByProvider(
  provider: IntegrationProvider,
) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return null;
  }

  const { data, error } = await adminClient
    .from("integration_settings")
    .select("provider, enabled, config")
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Pick<IntegrationSetting, "provider" | "enabled" | "config">;
}

export async function upsertIntegrationSetting(
  provider: IntegrationProvider,
  enabled: boolean,
  config: Record<string, string>,
) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado.");
  }

  const payload = {
    provider,
    enabled,
    config,
    updated_at: new Date().toISOString(),
  };

  const existing = await adminClient
    .from("integration_settings")
    .select("id")
    .eq("provider", provider)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  const { error } = existing.data
    ? await adminClient
        .from("integration_settings")
        .update(payload)
        .eq("id", existing.data.id)
    : await adminClient.from("integration_settings").insert(payload);

  if (error) {
    throw new Error(error.message);
  }
}
