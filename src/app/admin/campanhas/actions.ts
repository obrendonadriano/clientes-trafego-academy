"use server";

import { revalidatePath } from "next/cache";
import { importMetaCampaigns, runMetaSync } from "@/lib/sync/meta-sync";

export type CampaignImportState = {
  success?: string;
  error?: string;
};

export async function importMetaCampaignsAction(
  prevState: CampaignImportState,
  formData: FormData,
): Promise<CampaignImportState> {
  void prevState;
  void formData;

  try {
    const count = await importMetaCampaigns();
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
