import { getIntegrationSettingByProvider } from "@/lib/integrations";

const META_GRAPH_VERSION = "v22.0";

export async function getMetaAdsConfig() {
  const integration = await getIntegrationSettingByProvider("meta_ads");
  const config = integration?.config ?? {};

  return {
    enabled: integration?.enabled ?? false,
    appId: config.app_id ?? "",
    appSecret: config.app_secret ?? "",
    adAccountId: config.ad_account_id ?? "",
    accessToken: config.access_token ?? "",
  };
}

export function getMetaRedirectUri() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl}/api/meta/callback`;
}

export function buildMetaConnectUrl(appId: string) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getMetaRedirectUri(),
    response_type: "code",
    scope: "ads_read,ads_management,business_management",
  });

  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function exchangeMetaCodeForToken(input: {
  appId: string;
  appSecret: string;
  code: string;
}) {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: getMetaRedirectUri(),
    client_secret: input.appSecret,
    code: input.code,
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Falha ao trocar o code por access token da Meta.");
  }

  return (await response.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };
}

export async function fetchMetaCampaigns(input: {
  adAccountId: string;
  accessToken: string;
}) {
  const accountId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`;

  const params = new URLSearchParams({
    fields: "id,name,status",
    limit: "100",
    access_token: input.accessToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/campaigns?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Falha ao buscar campanhas da Meta Ads.");
  }

  return (await response.json()) as {
    data: Array<{
      id: string;
      name: string;
      status: string;
    }>;
  };
}

export async function fetchMetaInsights(input: {
  adAccountId: string;
  accessToken: string;
  datePreset?: string;
}) {
  const accountId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`;

  const params = new URLSearchParams({
    level: "campaign",
    fields:
      "campaign_id,campaign_name,date_start,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,purchase_roas",
    time_increment: "1",
    date_preset: input.datePreset ?? "last_30d",
    access_token: input.accessToken,
    limit: "500",
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/insights?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Falha ao buscar métricas da Meta Ads.");
  }

  return (await response.json()) as {
    data: Array<{
      campaign_id: string;
      campaign_name: string;
      date_start: string;
      spend?: string;
      reach?: string;
      impressions?: string;
      clicks?: string;
      ctr?: string;
      cpc?: string;
      cpm?: string;
      frequency?: string;
      actions?: Array<{
        action_type: string;
        value: string;
      }>;
      purchase_roas?: Array<{
        action_type: string;
        value: string;
      }>;
    }>;
  };
}
