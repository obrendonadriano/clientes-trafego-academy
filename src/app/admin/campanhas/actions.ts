"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import {
  MetaPermissionError,
  MetaTokenExpiredError,
  updateMetaCampaign,
} from "@/lib/meta-ads";
import { getAccessTokenForMetaAccount } from "@/lib/meta/accounts";
import { importAllMetaCampaigns, runMetaSync } from "@/lib/sync/meta-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CampaignImportState = {
  success?: string;
  error?: string;
};

export type CampaignEditResult = {
  success?: string;
  error?: string;
};

type DbCampaignEditRow = {
  id: string;
  external_id: string | null;
  meta_account_id: string | null;
};

async function requireAdminAndCampaign(campaignId: string) {
  const user = await getOptionalCurrentUser();

  if (!user || user.role !== "admin") {
    return { error: "Apenas administradores podem gerenciar campanhas." as const };
  }

  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return { error: "Supabase não configurado." as const };
  }

  const { data, error } = await adminClient
    .from("campaigns")
    .select("id, external_id, meta_account_id")
    .eq("id", campaignId)
    .maybeSingle<DbCampaignEditRow>();

  if (error || !data) {
    return { error: "Campanha não encontrada." as const };
  }

  return { adminClient, campaign: data };
}

function describeMetaWriteError(error: unknown) {
  if (error instanceof MetaPermissionError) {
    return "O token da Meta não tem permissão de gerenciamento (ads_management). Gere um novo token com essa permissão em Configurações.";
  }

  if (error instanceof MetaTokenExpiredError) {
    return "O token da Meta expirou. Reconecte a conta em Configurações.";
  }

  return error instanceof Error
    ? error.message
    : "Falha inesperada ao atualizar a campanha na Meta.";
}

export async function renameCampaignAction(
  campaignId: string,
  name: string,
): Promise<CampaignEditResult> {
  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { error: "O nome da campanha precisa de ao menos 2 caracteres." };
  }

  const guard = await requireAdminAndCampaign(campaignId);
  if ("error" in guard) return { error: guard.error };
  const { adminClient, campaign } = guard;

  if (campaign.external_id) {
    const token = await getAccessTokenForMetaAccount(campaign.meta_account_id);

    if (!token) {
      return { error: "Não há token da Meta configurado para esta campanha." };
    }

    try {
      await updateMetaCampaign(campaign.external_id, { name: trimmed }, token);
    } catch (error) {
      return { error: describeMetaWriteError(error) };
    }
  }

  const { error } = await adminClient
    .from("campaigns")
    .update({ nome: trimmed })
    .eq("id", campaignId);

  if (error) {
    return { error: error.message };
  }

  updateTag("campaigns");
  revalidatePath("/admin/campanhas");
  return { success: "Nome atualizado." };
}

export async function toggleCampaignStatusAction(
  campaignId: string,
  active: boolean,
): Promise<CampaignEditResult> {
  const guard = await requireAdminAndCampaign(campaignId);
  if ("error" in guard) return { error: guard.error };
  const { adminClient, campaign } = guard;

  if (campaign.external_id) {
    const token = await getAccessTokenForMetaAccount(campaign.meta_account_id);

    if (!token) {
      return { error: "Não há token da Meta configurado para esta campanha." };
    }

    try {
      await updateMetaCampaign(
        campaign.external_id,
        { status: active ? "ACTIVE" : "PAUSED" },
        token,
      );
    } catch (error) {
      return { error: describeMetaWriteError(error) };
    }
  }

  const { error } = await adminClient
    .from("campaigns")
    .update({ status: active ? "Ativa" : "Pausada" })
    .eq("id", campaignId);

  if (error) {
    return { error: error.message };
  }

  updateTag("campaigns");
  revalidatePath("/admin/campanhas");
  revalidatePath("/dashboard");
  return { success: active ? "Campanha ativada." : "Campanha pausada." };
}

export async function importMetaCampaignsAction(
  prevState: CampaignImportState,
  formData: FormData,
): Promise<CampaignImportState> {
  void prevState;
  void formData;

  try {
    const count = await importAllMetaCampaigns();
    updateTag("campaigns");
    revalidatePath("/admin/campanhas");
    revalidatePath("/admin/clientes");
    return { success: `${count} campanha(s) importada(s) da Meta Ads.` };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Falha inesperada ao importar campanhas da Meta Ads.",
    };
  }
}

export async function importMetaInsightsAction(
  prevState: CampaignImportState,
  formData: FormData,
): Promise<CampaignImportState> {
  void prevState;
  void formData;

  try {
    const result = await runMetaSync();
    revalidatePath("/admin");
    revalidatePath("/admin/campanhas");
    revalidatePath("/dashboard");
    return {
      success: `Sincronização concluída com ${result.campaignCount} campanha(s) e ${result.metricCount} registro(s).`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Falha inesperada ao importar métricas da Meta Ads.",
    };
  }
}

export async function runMetaAutoSyncAction(
  prevState: CampaignImportState,
  formData: FormData,
): Promise<CampaignImportState> {
  void prevState;
  void formData;

  try {
    const result = await runMetaSync();
    return {
      success: `Sincronização concluída com ${result.campaignCount} campanha(s) e ${result.metricCount} registro(s).`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Falha inesperada ao sincronizar a Meta Ads.",
    };
  }
}
