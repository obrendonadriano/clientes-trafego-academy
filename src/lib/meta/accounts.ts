import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMetaAdsConfig } from "@/lib/meta-ads";
import type { MetaAdAccount } from "@/lib/types";

// Conta resolvida e pronta para sincronizar: já traz o token efetivo
// (o próprio da conta ou, se vazio, o token compartilhado da Business Manager).
export type ResolvedMetaAccount = {
  id: string | null;
  label: string;
  adAccountId: string;
  accessToken: string;
};

type DbMetaAccountRow = {
  id: string;
  label: string;
  ad_account_id: string;
  access_token: string | null;
  enabled: boolean;
  status: "pending" | "ok" | "error";
  last_message: string | null;
  last_synced_at: string | null;
};

function mapAccount(row: DbMetaAccountRow): MetaAdAccount {
  return {
    id: row.id,
    label: row.label,
    adAccountId: row.ad_account_id,
    hasOwnToken: Boolean(row.access_token),
    enabled: row.enabled,
    status: row.status,
    lastMessage: row.last_message,
    lastSyncedAt: row.last_synced_at,
  };
}

// Lista as contas cadastradas para exibição na UI (sem expor tokens).
export async function listMetaAdAccounts(): Promise<MetaAdAccount[]> {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return [];
  }

  const { data, error } = await adminClient
    .from("meta_ad_accounts")
    .select(
      "id, label, ad_account_id, access_token, enabled, status, last_message, last_synced_at",
    )
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as DbMetaAccountRow[]).map(mapAccount);
}

// Contas ativas resolvidas para o sync. Com fallback retrocompatível: se ainda
// não houver contas cadastradas mas existir a config antiga (conta única),
// devolve essa config como uma conta implícita.
export async function getSyncableMetaAccounts(): Promise<ResolvedMetaAccount[]> {
  const shared = await getMetaAdsConfig();
  const adminClient = createSupabaseAdminClient();

  const rows: DbMetaAccountRow[] = [];

  if (adminClient) {
    const { data } = await adminClient
      .from("meta_ad_accounts")
      .select(
        "id, label, ad_account_id, access_token, enabled, status, last_message, last_synced_at",
      )
      .eq("enabled", true)
      .order("created_at", { ascending: true });

    rows.push(...((data as DbMetaAccountRow[] | null) ?? []));
  }

  if (rows.length === 0) {
    // Fallback: nenhuma conta cadastrada ainda → usa a config única antiga.
    if (shared.enabled && shared.adAccountId && shared.accessToken) {
      return [
        {
          id: null,
          label: "Conta principal",
          adAccountId: shared.adAccountId,
          accessToken: shared.accessToken,
        },
      ];
    }

    return [];
  }

  return rows
    .map((row) => ({
      id: row.id,
      label: row.label,
      adAccountId: row.ad_account_id,
      accessToken: row.access_token || shared.accessToken,
    }))
    .filter((account) => Boolean(account.adAccountId && account.accessToken));
}

export async function createMetaAdAccount(input: {
  label: string;
  adAccountId: string;
  accessToken?: string;
}) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado.");
  }

  const { error } = await adminClient.from("meta_ad_accounts").insert({
    label: input.label,
    ad_account_id: input.adAccountId,
    access_token: input.accessToken?.trim() || null,
    enabled: true,
    status: "pending",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateMetaAdAccount(
  id: string,
  input: { label?: string; adAccountId?: string; accessToken?: string | null; enabled?: boolean },
) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado.");
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.label !== undefined) payload.label = input.label;
  if (input.adAccountId !== undefined) payload.ad_account_id = input.adAccountId;
  // accessToken: string preenche; string vazia limpa (volta a usar o compartilhado).
  if (input.accessToken !== undefined) {
    payload.access_token =
      typeof input.accessToken === "string" && input.accessToken.trim()
        ? input.accessToken.trim()
        : null;
  }
  if (input.enabled !== undefined) payload.enabled = input.enabled;

  const { error } = await adminClient
    .from("meta_ad_accounts")
    .update(payload)
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteMetaAdAccount(id: string) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    throw new Error("Supabase admin não configurado.");
  }

  const { error } = await adminClient.from("meta_ad_accounts").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

// Atualiza o status de sincronização de uma conta (chamado pelo sync).
export async function setMetaAccountSyncStatus(
  id: string,
  status: "ok" | "error",
  message: string | null,
) {
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return;
  }

  await adminClient
    .from("meta_ad_accounts")
    .update({
      status,
      last_message: message,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}
