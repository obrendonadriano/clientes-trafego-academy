import { getIntegrationSettingByProvider } from "@/lib/integrations";

const META_GRAPH_VERSION = "v22.0";

// Token inválido/expirado (Graph API code 190). Carrega a mensagem real da
// Meta para diagnóstico (ex.: "Session has expired", "user not authorized").
export class MetaTokenExpiredError extends Error {
  constructor(metaMessage?: string) {
    super(
      metaMessage
        ? `Token recusado pela Meta — ${metaMessage}`
        : "O token de acesso da Meta expirou ou foi revogado.",
    );
    this.name = "MetaTokenExpiredError";
  }
}

// Token válido, mas sem permissão para acessar ESTA conta de anúncio
// (codes 10 / 200 / 803). Causa diferente de token expirado.
export class MetaPermissionError extends Error {
  constructor(metaMessage?: string) {
    super(
      metaMessage
        ? `Sem permissão nesta conta — ${metaMessage}`
        : "O token não tem permissão para acessar esta conta de anúncio.",
    );
    this.name = "MetaPermissionError";
  }
}

// Limite de requisições da Graph API atingido (codes 4/17/32/613, subcode 80004).
export class MetaRateLimitError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "A Meta limitou as requisições temporariamente. A sincronização tentará novamente na próxima execução.",
    );
    this.name = "MetaRateLimitError";
  }
}

type MetaGraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

const META_RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const META_PERMISSION_CODES = new Set([10, 200, 803]);
const META_RATE_LIMIT_RETRY_DELAY_MS = 15_000;

function throwForMetaError(status: number, body: MetaGraphError): never {
  const code = body.error?.code;
  const subcode = body.error?.error_subcode;
  const message = body.error?.message;

  if (code === 190) {
    throw new MetaTokenExpiredError(message);
  }

  if (code !== undefined && META_PERMISSION_CODES.has(code)) {
    throw new MetaPermissionError(message);
  }

  if ((code !== undefined && META_RATE_LIMIT_CODES.has(code)) || subcode === 80004) {
    throw new MetaRateLimitError();
  }

  throw new Error(
    message
      ? `A Meta retornou um erro: ${message}`
      : `Falha ao buscar dados da Meta Ads (HTTP ${status}).`,
  );
}

// Lê os headers de uso da Graph API; retorna true se algum indicador de
// consumo estiver perto do limite (>= 95%).
function isMetaUsageNearLimit(response: Response) {
  for (const headerName of ["x-business-use-case-usage", "x-ad-account-usage", "x-app-usage"]) {
    const raw = response.headers.get(headerName);

    if (!raw) {
      continue;
    }

    try {
      const usage = JSON.parse(raw) as unknown;
      const values: number[] = [];

      const collect = (node: unknown) => {
        if (typeof node === "number") {
          values.push(node);
        } else if (Array.isArray(node)) {
          node.forEach(collect);
        } else if (node && typeof node === "object") {
          for (const [key, value] of Object.entries(node)) {
            if (/util_pct|cpu_time|total_time|call_count/.test(key) && typeof value === "number") {
              values.push(value);
            } else {
              collect(value);
            }
          }
        }
      };

      collect(usage);

      if (values.some((value) => value >= 95)) {
        return true;
      }
    } catch {
      // Header de uso ilegível não deve derrubar a sincronização.
    }
  }

  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMetaPage(url: string) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    let body: MetaGraphError = {};

    try {
      body = (await response.json()) as MetaGraphError;
    } catch {
      // Corpo não-JSON: segue para o erro genérico.
    }

    throwForMetaError(response.status, body);
  }

  return response;
}

async function fetchMetaPaginated<T>(url: string) {
  const allData: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    let response: Response;

    try {
      response = await fetchMetaPage(nextUrl);
    } catch (error) {
      // Uma única retentativa com backoff quando a Meta limita as chamadas.
      if (error instanceof MetaRateLimitError) {
        await sleep(META_RATE_LIMIT_RETRY_DELAY_MS);
        response = await fetchMetaPage(nextUrl);
      } else {
        throw error;
      }
    }

    const payload = (await response.json()) as {
      data: T[];
      paging?: {
        next?: string;
      };
    };

    allData.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ?? null;

    // Perto do limite de uso, interrompe a paginação para não estourar o
    // rate limit — a próxima sincronização completa o restante.
    if (nextUrl && isMetaUsageNearLimit(response)) {
      console.warn(
        "Meta Ads: uso da API próximo do limite; paginação interrompida nesta execução.",
      );
      break;
    }
  }

  return allData;
}

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
    fields: "id,name,status,objective",
    limit: "100",
    access_token: input.accessToken,
  });

  const data = await fetchMetaPaginated<{
    id: string;
    name: string;
    status: string;
    objective?: string;
  }>(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/campaigns?${params.toString()}`,
  );

  return { data };
}

export async function fetchMetaInsights(input: {
  adAccountId: string;
  accessToken: string;
  datePreset?: string;
  breakdown?: "hourly_stats_aggregated_by_advertiser_time_zone";
}) {
  const accountId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`;

  const params = new URLSearchParams({
    level: "campaign",
    fields:
      "campaign_id,campaign_name,date_start,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,purchase_roas,account_currency",
    date_preset: input.datePreset ?? "last_30d",
    access_token: input.accessToken,
    limit: "500",
  });

  if (!input.breakdown) {
    params.set("time_increment", "1");
  } else {
    params.set("breakdowns", input.breakdown);
  }

  const data = await fetchMetaPaginated<{
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
    account_currency?: string;
    hourly_stats_aggregated_by_advertiser_time_zone?: string;
  }>(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/insights?${params.toString()}`,
  );

  return { data };
}

// Cotação de uma moeda para BRL (cotação atual). Usado para converter os
// valores de contas em moeda estrangeira (ex.: USD) ao sincronizar.
// Fonte: AwesomeAPI (gratuita, sem chave). Cai para uma taxa fixa se falhar.
export async function getCurrencyRateToBrl(currency: string): Promise<number> {
  const code = (currency || "BRL").toUpperCase();

  if (code === "BRL") {
    return 1;
  }

  try {
    const response = await fetch(
      `https://economia.awesomeapi.com.br/last/${code}-BRL`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );

    if (response.ok) {
      const data = (await response.json()) as Record<
        string,
        { bid?: string; ask?: string }
      >;
      // ask = preço de venda (o "dólar comercial" que se paga ao comprar);
      // mais próximo da cotação que o usuário vê. Cai para bid se faltar.
      const quote = data?.[`${code}BRL`];
      const rate = Number(quote?.ask ?? quote?.bid);

      if (Number.isFinite(rate) && rate > 0) {
        return rate;
      }
    }
  } catch {
    // Sem internet/timeout: usa o fallback abaixo.
  }

  // Fallback configurável por env (ex.: USD_BRL_FALLBACK_RATE=5.40).
  const fallback = Number(process.env[`${code}_BRL_FALLBACK_RATE`]);
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  return code === "USD" ? 5.4 : 1;
}
