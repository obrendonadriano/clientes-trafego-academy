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

// Instabilidade passageira do lado da Meta (codes 1 e 2, ou HTTP 5xx): não é
// erro de token nem de permissão, então vale tentar de novo em vez de marcar a
// conta como quebrada. É o famoso "Service temporarily unavailable".
export class MetaTemporaryError extends Error {
  constructor(metaMessage?: string) {
    super(
      metaMessage
        ? `A Meta está instável no momento — ${metaMessage}`
        : "A Meta está temporariamente indisponível.",
    );
    this.name = "MetaTemporaryError";
  }
}

// Limite de requisições da Graph API atingido (codes 4/17/32/613, subcode 80004).
export class MetaRateLimitError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "A Meta limitou as requisições temporariamente. Aguarde alguns minutos e atualize novamente pelo botão.",
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
// code 1 = erro desconhecido/transitório; code 2 = serviço indisponível.
const META_TEMPORARY_CODES = new Set([1, 2]);
const META_RATE_LIMIT_RETRY_DELAY_MS = 15_000;
const META_TEMPORARY_RETRY_DELAYS_MS = [2_000, 6_000, 15_000];
const META_REQUEST_TIMEOUT_MS = 30_000;

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

  if ((code !== undefined && META_TEMPORARY_CODES.has(code)) || status >= 500) {
    throw new MetaTemporaryError(message);
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
    signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
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

// Insiste em erros passageiros (rate limit e indisponibilidade da Meta) com
// espera crescente. Erros de token/permissão passam direto, porque insistir
// neles não resolve nada.
async function fetchMetaPageWithRetry(url: string) {
  let temporaryAttempt = 0;
  let rateLimitRetried = false;

  while (true) {
    try {
      return await fetchMetaPage(url);
    } catch (error) {
      if (error instanceof MetaRateLimitError && !rateLimitRetried) {
        rateLimitRetried = true;
        await sleep(META_RATE_LIMIT_RETRY_DELAY_MS);
        continue;
      }

      if (
        error instanceof MetaTemporaryError &&
        temporaryAttempt < META_TEMPORARY_RETRY_DELAYS_MS.length
      ) {
        await sleep(META_TEMPORARY_RETRY_DELAYS_MS[temporaryAttempt]);
        temporaryAttempt += 1;
        continue;
      }

      throw error;
    }
  }
}

async function fetchMetaPaginated<T>(url: string) {
  const allData: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    // Rate limit e instabilidade da Meta são passageiros: vale insistir em vez
    // de derrubar a sincronização inteira da conta.
    const response = await fetchMetaPageWithRetry(nextUrl);

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
      signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
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

// Escreve na Meta: atualiza nome e/ou status (ACTIVE/PAUSED) de uma campanha.
// Exige token com permissão ads_management.
export async function updateMetaCampaign(
  campaignExternalId: string,
  fields: { name?: string; status?: "ACTIVE" | "PAUSED" },
  accessToken: string,
) {
  return updateMetaObject(campaignExternalId, fields, accessToken);
}

export async function updateMetaObjectStatus(
  externalId: string,
  status: "ACTIVE" | "PAUSED",
  accessToken: string,
) {
  return updateMetaObject(externalId, { status }, accessToken);
}

async function updateMetaObject(
  externalId: string,
  fields: { name?: string; status?: "ACTIVE" | "PAUSED" },
  accessToken: string,
) {
  const params = new URLSearchParams({ access_token: accessToken });

  if (fields.name !== undefined) {
    params.set("name", fields.name);
  }
  if (fields.status !== undefined) {
    params.set("status", fields.status);
  }

  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${externalId}`,
    {
      method: "POST",
      body: params,
      cache: "no-store",
      signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    let body: MetaGraphError = {};

    try {
      body = (await response.json()) as MetaGraphError;
    } catch {
      // corpo não-JSON → erro genérico abaixo
    }

    throwForMetaError(response.status, body);
  }

  return (await response.json()) as { success?: boolean; id?: string };
}

// Conjuntos de anúncios: o destino (WhatsApp/Messenger) e a meta de otimização
// dizem o resultado REAL melhor do que o objetivo amplo da campanha.
export async function fetchMetaAdSets(input: {
  adAccountId: string;
  accessToken: string;
}) {
  const accountId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`;

  const params = new URLSearchParams({
    fields: "id,name,campaign_id,status,effective_status,optimization_goal,destination_type",
    limit: "200",
    access_token: input.accessToken,
  });

  const data = await fetchMetaPaginated<{
    id: string;
    name: string;
    campaign_id: string;
    status?: string;
    effective_status?: string;
    optimization_goal?: string;
    destination_type?: string;
  }>(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/adsets?${params.toString()}`,
  );

  return { data };
}

export async function fetchMetaAds(input: {
  adAccountId: string;
  accessToken: string;
}) {
  const accountId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`;

  const params = new URLSearchParams({
    fields: "id,name,campaign_id,adset_id,status,effective_status",
    limit: "300",
    access_token: input.accessToken,
  });

  const data = await fetchMetaPaginated<{
    id: string;
    name: string;
    campaign_id: string;
    adset_id: string;
    status?: string;
    effective_status?: string;
  }>(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/ads?${params.toString()}`,
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

export type MetaLevel = "adset" | "ad";

export type MetaLevelInsightRow = {
  campaign_id: string;
  campaign_name: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  reach?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  account_currency?: string;
  date_start?: string;
};

// Insights agregados no periodo, por conjunto de anuncios ou por anuncio.
// Diferente de fetchMetaInsights, NAO usa time_increment: o drill-down mostra
// o total do periodo, nao a serie diaria.
export async function fetchMetaLevelInsights(input: {
  adAccountId: string;
  accessToken: string;
  level: MetaLevel;
  since: string;
  until: string;
  daily?: boolean;
}) {
  const accountId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`;

  const baseFields =
    input.level === "adset"
      ? "campaign_id,campaign_name,adset_id,adset_name,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,purchase_roas,account_currency"
      : "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,purchase_roas,account_currency";
  const fields = input.daily ? `${baseFields},date_start` : baseFields;

  const params = new URLSearchParams({
    level: input.level,
    fields,
    time_range: JSON.stringify({ since: input.since, until: input.until }),
    access_token: input.accessToken,
    limit: "300",
  });

  if (input.daily) {
    params.set("time_increment", "1");
  }

  const data = await fetchMetaPaginated<MetaLevelInsightRow>(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/insights?${params.toString()}`,
  );

  return { data };
}

// Cotação de fechamento de cada dia, em BRL, por dia (yyyy-MM-dd).
// O gasto de um dia precisa ser convertido pela cotação DAQUELE dia — usar a
// cotação de hoje para o mês inteiro distorce o fechamento.
//
// Fonte primária: PTAX do Banco Central (oficial, é a referência usada em
// fechamento contábil no Brasil). Se falhar, cai para a AwesomeAPI.
export async function getDailyRatesToBrl(
  currency: string,
  days = 90,
): Promise<Map<string, number>> {
  const code = (currency || "BRL").toUpperCase();

  if (code === "BRL") {
    return new Map();
  }

  if (code === "USD") {
    const ptax = await fetchPtaxDailyRates(days);

    if (ptax.size > 0) {
      return ptax;
    }
  }

  return fetchAwesomeApiDailyRates(code, days);
}

function formatBcbDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}-${date.getFullYear()}`;
}

// PTAX (dólar comercial de fechamento) do Banco Central, dia a dia.
async function fetchPtaxDailyRates(days: number) {
  const rates = new Map<string, number>();
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);

  const url =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
    "CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
    `?@dataInicial='${formatBcbDate(start)}'` +
    `&@dataFinalCotacao='${formatBcbDate(end)}'` +
    "&$format=json&$select=cotacaoVenda,dataHoraCotacao";

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return rates;
    }

    const data = (await response.json()) as {
      value?: Array<{ cotacaoVenda?: number; dataHoraCotacao?: string }>;
    };

    for (const item of data.value ?? []) {
      const rate = Number(item.cotacaoVenda);
      const day = (item.dataHoraCotacao ?? "").slice(0, 10);

      if (day && Number.isFinite(rate) && rate > 0) {
        rates.set(day, rate);
      }
    }
  } catch {
    // Sem resposta do BCB: quem chamou tenta a próxima fonte.
  }

  return rates;
}

// Fonte secundária (cobre moedas fora do PTAX e queda do BCB).
async function fetchAwesomeApiDailyRates(code: string, days: number) {
  const rates = new Map<string, number>();

  try {
    // O endpoint conta dias ÚTEIS; pede com folga para cobrir a janela toda.
    const requested = Math.min(Math.ceil(days * 0.75) + 10, 360);
    const response = await fetch(
      `https://economia.awesomeapi.com.br/json/daily/${code}-BRL/${requested}`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) },
    );

    if (!response.ok) {
      return rates;
    }

    const data = (await response.json()) as Array<{
      timestamp?: string;
      bid?: string;
      ask?: string;
    }>;

    for (const item of data) {
      const seconds = Number(item.timestamp);

      if (!Number.isFinite(seconds)) {
        continue;
      }

      const rate = Number(item.ask ?? item.bid);

      if (!Number.isFinite(rate) || rate <= 0) {
        continue;
      }

      // Chave em yyyy-MM-dd no fuso de São Paulo (o mesmo das métricas).
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(seconds * 1000));

      // A série vem do mais recente para o mais antigo: mantém a primeira.
      if (!rates.has(day)) {
        rates.set(day, rate);
      }
    }
  } catch {
    // Sem internet/timeout: quem chamou cai para a cotação atual.
  }

  return rates;
}

// Resolve a cotação de um dia específico: usa a do próprio dia e, se faltar
// (fim de semana, feriado, falha da API), o dia útil anterior mais próximo.
export function resolveRateForDay(
  rates: Map<string, number>,
  day: string,
  fallback: number,
) {
  const direct = rates.get(day);

  if (direct) {
    return direct;
  }

  if (rates.size === 0) {
    return fallback;
  }

  const earlier = [...rates.keys()].filter((key) => key <= day).sort();
  const nearest = earlier.at(-1);

  return nearest ? (rates.get(nearest) ?? fallback) : fallback;
}

export type ExchangeRateSource = "bcb" | "awesomeapi" | "fallback" | "nativo";

export type ExchangeRateInfo = {
  currency: string;
  rate: number;
  source: ExchangeRateSource;
  checkedAt: string;
};

// Diagnóstico da cotação: além do valor, diz DE ONDE ele veio. O painel usa
// isso para avisar quando está rodando no valor de emergência — foi assim que
// o câmbio ficou travado em 5,40 sem ninguém perceber.
export async function getExchangeRateInfo(
  currency = "USD",
): Promise<ExchangeRateInfo> {
  const code = (currency || "BRL").toUpperCase();
  const checkedAt = new Date().toISOString();

  if (code === "BRL") {
    return { currency: code, rate: 1, source: "nativo", checkedAt };
  }

  if (code === "USD") {
    const ptax = await fetchPtaxDailyRates(15);
    const lastDay = [...ptax.keys()].sort().at(-1);
    const lastRate = lastDay ? ptax.get(lastDay) : undefined;

    if (lastRate && lastRate > 0) {
      return { currency: code, rate: lastRate, source: "bcb", checkedAt };
    }
  }

  const live = await fetchAwesomeApiRate(code);

  if (live) {
    return { currency: code, rate: live, source: "awesomeapi", checkedAt };
  }

  return {
    currency: code,
    rate: resolveFallbackRate(code),
    source: "fallback",
    checkedAt,
  };
}

function resolveFallbackRate(code: string) {
  const configured = Number(process.env[`${code}_BRL_FALLBACK_RATE`]);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return code === "USD" ? 5.4 : 1;
}

// Cotação atual na AwesomeAPI; null quando a fonte não responde.
async function fetchAwesomeApiRate(code: string) {
  try {
    const response = await fetch(
      `https://economia.awesomeapi.com.br/last/${code}-BRL`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<
      string,
      { bid?: string; ask?: string }
    >;
    // ask = preço de venda (o "dólar comercial" que se paga ao comprar);
    // mais próximo da cotação que o usuário vê. Cai para bid se faltar.
    const quote = data?.[`${code}BRL`];
    const rate = Number(quote?.ask ?? quote?.bid);

    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

// Cotação atual de uma moeda para BRL. Fontes em cascata (Banco Central →
// AwesomeAPI → valor de emergência); use getExchangeRateInfo quando precisar
// saber de QUAL delas o número veio.
export async function getCurrencyRateToBrl(currency: string): Promise<number> {
  const info = await getExchangeRateInfo(currency);
  return info.rate;
}
