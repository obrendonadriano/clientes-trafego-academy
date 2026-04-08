"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  fetchMetaCampaigns,
  fetchMetaInsights,
  getMetaAdsConfig,
} from "@/lib/meta-ads";

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
  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return {
      error: "Supabase admin não configurado para importar campanhas.",
    };
  }

  const config = await getMetaAdsConfig();

  if (!config.accessToken || !config.adAccountId) {
    return {
      error:
        "Conecte a Meta Ads em Configurações e informe o Ad Account ID antes de importar.",
    };
  }

  try {
    const result = await fetchMetaCampaigns({
      adAccountId: config.adAccountId,
      accessToken: config.accessToken,
    });

    if (result.data.length === 0) {
      return {
        success: "Nenhuma campanha encontrada nessa conta.",
      };
    }

    const { error } = await adminClient.from("campaigns").upsert(
      result.data.map((campaign) => ({
        nome: campaign.name,
        status: campaign.status === "ACTIVE" ? "Ativa" : "Pausada",
        plataforma: "Meta Ads",
        external_id: campaign.id,
        source: "meta_ads",
        client_id: null,
      })),
      {
        onConflict: "external_id",
      },
    );

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/campanhas");
    revalidatePath("/admin/clientes");
    return { success: `${result.data.length} campanha(s) importada(s) da Meta Ads.` };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Falha inesperada ao importar campanhas da Meta Ads.",
    };
  }
}

function getActionsValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: string[],
) {
  if (!actions) return 0;

  return actions
    .filter((item) => types.includes(item.action_type))
    .reduce((sum, item) => sum + Number(item.value || 0), 0);
}

export async function importMetaInsightsAction(
  prevState: CampaignImportState,
  formData: FormData,
): Promise<CampaignImportState> {
  void prevState;
  void formData;

  const adminClient = createSupabaseAdminClient();

  if (!adminClient) {
    return {
      error: "Supabase admin não configurado para importar métricas.",
    };
  }

  const config = await getMetaAdsConfig();

  if (!config.accessToken || !config.adAccountId) {
    return {
      error:
        "Conecte a Meta Ads em Configurações e informe o Ad Account ID antes de importar métricas.",
    };
  }

  try {
    const insights = await fetchMetaInsights({
      adAccountId: config.adAccountId,
      accessToken: config.accessToken,
      datePreset: "last_30d",
    });

    const { data: campaigns, error: campaignsError } = await adminClient
      .from("campaigns")
      .select("id, external_id");

    if (campaignsError || !campaigns) {
      return {
        error: campaignsError?.message ?? "Não foi possível mapear as campanhas locais.",
      };
    }

    const campaignIdByExternalId = new Map(
      campaigns
        .filter((campaign) => campaign.external_id)
        .map((campaign) => [campaign.external_id as string, campaign.id as string]),
    );

    const rows = insights.data
      .map((item) => {
        const campaignId = campaignIdByExternalId.get(item.campaign_id);

        if (!campaignId) {
          return null;
        }

        const leads = getActionsValue(item.actions, [
          "lead",
          "onsite_conversion.lead_grouped",
          "offsite_conversion.fb_pixel_lead",
        ]);

        const roas =
          item.purchase_roas?.reduce(
            (sum, current) => sum + Number(current.value || 0),
            0,
          ) ?? 0;

        const spend = Number(item.spend || 0);

        return {
          campaign_id: campaignId,
          date: item.date_start,
          amount_spent: spend,
          reach: Number(item.reach || 0),
          impressions: Number(item.impressions || 0),
          clicks: Number(item.clicks || 0),
          ctr: Number(item.ctr || 0),
          cpc: Number(item.cpc || 0),
          cpm: Number(item.cpm || 0),
          leads,
          cost_per_lead: leads > 0 ? spend / leads : 0,
          roi: 0,
          roas,
          frequency: Number(item.frequency || 0),
        };
      })
      .filter(Boolean);

    if (rows.length === 0) {
      return {
        error:
          "Nenhuma métrica foi importada. Verifique se as campanhas já foram importadas primeiro.",
      };
    }

    const { error } = await adminClient.from("campaign_metrics").upsert(rows, {
      onConflict: "campaign_id,date",
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/campanhas");
    revalidatePath("/dashboard");
    return { success: `${rows.length} registro(s) de métricas importado(s).` };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Falha inesperada ao importar métricas da Meta Ads.",
    };
  }
}
