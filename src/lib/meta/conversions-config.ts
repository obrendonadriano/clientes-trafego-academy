import "server-only";

import { getIntegrationSettingByProvider } from "@/lib/integrations";

// Configuração da integração oficial de Conversões (Embedded Signup, webhook e
// Conversions API). O App ID/Secret já existiam em Configurações → Meta Ads;
// as variáveis de ambiente têm prioridade para quem prefere mantê-los fora do
// banco. Nada aqui é exposto ao navegador além de appId e configId, que são
// públicos por natureza no fluxo do Embedded Signup.

// Versão estável no momento da implementação. Configurável porque a Meta
// descontinua versões: não vale fixar isso espalhado pelo código.
const DEFAULT_GRAPH_VERSION = "v26.0";

export function getMetaGraphVersion() {
  const configured = process.env.META_GRAPH_VERSION?.trim();
  return /^v\d+\.\d+$/.test(configured ?? "")
    ? (configured as string)
    : DEFAULT_GRAPH_VERSION;
}

export function graphUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `https://graph.facebook.com/${getMetaGraphVersion()}${normalized}`;
}

export type MetaConversionsConfig = {
  appId: string;
  appSecret: string;
  configId: string;
  verifyToken: string;
  // Conta de anúncios da agência. Só diagnóstico: a atribuição da Meta é pelo
  // Dataset, não pela conta, então nada é enviado para cá.
  adAccountId: string;
};

export async function getMetaConversionsConfig(): Promise<MetaConversionsConfig> {
  const integration = await getIntegrationSettingByProvider("meta_ads");
  const stored = integration?.config ?? {};

  return {
    appId: (process.env.META_APP_ID || stored.app_id || "").trim(),
    appSecret: (process.env.META_APP_SECRET || stored.app_secret || "").trim(),
    configId: (process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || "").trim(),
    verifyToken: (process.env.META_WEBHOOK_VERIFY_TOKEN || "").trim(),
    adAccountId: (
      process.env.META_AD_ACCOUNT_ID ||
      stored.ad_account_id ||
      ""
    ).trim(),
  };
}

export type EmbeddedSignupReadiness =
  | { ready: true; appId: string; configId: string; graphVersion: string }
  | { ready: false; missing: string[] };

// O que falta para o botão "Conectar WhatsApp Business" poder existir. A tela
// do cliente não mostra esses nomes; o painel do administrador mostra.
export async function getEmbeddedSignupReadiness(): Promise<EmbeddedSignupReadiness> {
  const config = await getMetaConversionsConfig();
  const missing: string[] = [];

  if (!config.appId) missing.push("META_APP_ID");
  if (!config.appSecret) missing.push("META_APP_SECRET");
  if (!config.configId) missing.push("META_EMBEDDED_SIGNUP_CONFIG_ID");
  if (!config.verifyToken) missing.push("META_WEBHOOK_VERIFY_TOKEN");
  if (!process.env.META_CREDENTIALS_KEY?.trim()) {
    missing.push("META_CREDENTIALS_KEY");
  }

  if (missing.length > 0) {
    return { ready: false, missing };
  }

  return {
    ready: true,
    appId: config.appId,
    configId: config.configId,
    graphVersion: getMetaGraphVersion(),
  };
}
