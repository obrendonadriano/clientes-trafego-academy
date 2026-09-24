import "server-only";

import { graphUrl, getMetaConversionsConfig } from "@/lib/meta/conversions-config";
import {
  resolveAuthorizedWaba,
  resolveSharedNumber,
} from "@/lib/meta/onboarding-selection";

// Onboarding oficial do WhatsApp Business (Coexistence) e resolução do Dataset
// de Conversões do cliente.
//
// Referências oficiais usadas aqui:
//   Embedded Signup / WhatsApp Business app onboarding
//     https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
//   Conversions API para Business Messaging (Dataset por WABA)
//     https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/
//
// Nada neste arquivo roda no navegador: o código de autorização vira token aqui
// e o token nunca volta para a resposta HTTP.

const TIMEOUT_MS = 30_000;

export class MetaOnboardingError extends Error {
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { userMessage?: string; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "MetaOnboardingError";
    this.userMessage =
      options.userMessage ??
      "Não foi possível concluir a conexão com a Meta. Tente novamente em alguns minutos.";
    this.retryable = options.retryable ?? false;
  }
}

type GraphError = {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
};

async function graphRequest<T>(
  path: string,
  init: RequestInit & { accessToken?: string; searchParams?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(graphUrl(path));

  for (const [key, value] of Object.entries(init.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }

  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new MetaOnboardingError(`Falha de rede ao chamar ${path}`, {
      userMessage:
        "A Meta não respondeu a tempo. A conexão não foi concluída; tente novamente.",
      retryable: true,
    });
  }

  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details = (payload as GraphError | null)?.error;
    const code = details?.code;
    // 190: token inválido/revogado. 4/17/32/613: limite. 1/2: instabilidade.
    const retryable = code === 1 || code === 2 || code === 4 || code === 17 || code === 32 || code === 613 || response.status >= 500;

    throw new MetaOnboardingError(
      `Graph ${path} respondeu ${response.status}: ${details?.message ?? "sem detalhe"}`,
      {
        userMessage:
          code === 190
            ? "A autorização da Meta expirou. Conecte o WhatsApp Business novamente."
            : retryable
              ? "A Meta está instável no momento. Tente novamente em alguns minutos."
              : "A Meta recusou a operação. Confira as permissões concedidas e tente de novo.",
        retryable,
      },
    );
  }

  return payload as T;
}

// 1. Troca do código do Embedded Signup por um token de negócio. Server-side,
//    com o app secret — que jamais chega ao navegador.
export async function exchangeSignupCode(code: string) {
  const { appId, appSecret } = await getMetaConversionsConfig();

  if (!appId || !appSecret) {
    throw new MetaOnboardingError("App da Meta não configurado", {
      userMessage:
        "A integração com a Meta ainda não foi configurada pelo administrador.",
    });
  }

  const payload = await graphRequest<{
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  }>("/oauth/access_token", {
    method: "GET",
    searchParams: {
      client_id: appId,
      client_secret: appSecret,
      code,
    },
  });

  if (!payload?.access_token) {
    throw new MetaOnboardingError("Resposta sem access_token", {
      userMessage:
        "A Meta não devolveu uma autorização válida. Refaça a conexão.",
    });
  }

  return payload.access_token;
}

export type TokenIntrospection = {
  wabaIds: string[];
  scopes: string[];
  expiresAt: number | null;
};

// 2. debug_token confirma o que a autorização realmente concede. Nunca confiar
//    só no que o navegador informou no evento do Embedded Signup.
export async function introspectToken(
  accessToken: string,
): Promise<TokenIntrospection> {
  const { appId, appSecret } = await getMetaConversionsConfig();

  const payload = await graphRequest<{
    data?: {
      scopes?: string[];
      expires_at?: number;
      granular_scopes?: { scope: string; target_ids?: string[] }[];
    };
  }>("/debug_token", {
    method: "GET",
    searchParams: {
      input_token: accessToken,
      access_token: `${appId}|${appSecret}`,
    },
  });

  const granular = payload?.data?.granular_scopes ?? [];
  const wabaIds = [
    ...new Set(
      granular
        .filter((item) => item.scope === "whatsapp_business_management")
        .flatMap((item) => item.target_ids ?? []),
    ),
  ];

  return {
    wabaIds,
    scopes: payload?.data?.scopes ?? [],
    expiresAt: payload?.data?.expires_at ?? null,
  };
}

export type OfficialPhoneNumber = {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  // Diagnóstico de Coexistence: o número segue ativo no app do celular.
  isOnBizApp: boolean | null;
  platformType: string | null;
};

// 3. Números do WABA, já pedindo os campos que comprovam Coexistence.
export async function listPhoneNumbers(
  wabaId: string,
  accessToken: string,
): Promise<OfficialPhoneNumber[]> {
  const payload = await graphRequest<{
    data?: {
      id: string;
      display_phone_number?: string;
      verified_name?: string;
      is_on_biz_app?: boolean;
      platform_type?: string;
    }[];
  }>(`/${encodeURIComponent(wabaId)}/phone_numbers`, {
    method: "GET",
    accessToken,
    searchParams: {
      fields: "id,display_phone_number,verified_name,is_on_biz_app,platform_type",
    },
  });

  return (payload?.data ?? []).map((row) => ({
    id: row.id,
    displayPhoneNumber: row.display_phone_number ?? null,
    verifiedName: row.verified_name ?? null,
    isOnBizApp: typeof row.is_on_biz_app === "boolean" ? row.is_on_biz_app : null,
    platformType: row.platform_type ?? null,
  }));
}

export async function getWabaDetails(wabaId: string, accessToken: string) {
  const payload = await graphRequest<{
    id?: string;
    name?: string;
    owner_business_info?: { id?: string; name?: string };
  }>(`/${encodeURIComponent(wabaId)}`, {
    method: "GET",
    accessToken,
    searchParams: { fields: "id,name,owner_business_info" },
  });

  return {
    name: payload?.name ?? null,
    businessId: payload?.owner_business_info?.id ?? null,
  };
}

// 4. Assina o app nos webhooks do WABA. Sem isso nenhuma mensagem de anúncio
//    chega à dashboard.
export async function subscribeWabaWebhook(wabaId: string, accessToken: string) {
  const payload = await graphRequest<{ success?: boolean }>(
    `/${encodeURIComponent(wabaId)}/subscribed_apps`,
    { method: "POST", accessToken },
  );

  return Boolean(payload?.success);
}

// 5. Dataset de Conversões do cliente.
//
//    A Meta documenta este endpoint como idempotente: "If there is already an
//    existing dataset_id associated with the Whatsapp Business Account, it will
//    return that ID." Ou seja, descobrir e criar são a mesma chamada oficial —
//    não existe um Dataset duplicado por reconectar.
//
//    Cada WABA tem exatamente um Dataset, e cada cliente tem o seu WABA. É daí
//    que vem o isolamento: nunca um Dataset compartilhado entre clientes.
export async function resolveWabaDataset(wabaId: string, accessToken: string) {
  const payload = await graphRequest<{ id?: string; data?: { id?: string }[] }>(
    `/${encodeURIComponent(wabaId)}/dataset`,
    { method: "POST", accessToken },
  );

  const datasetId = payload?.id ?? payload?.data?.[0]?.id ?? null;

  if (!datasetId || !/^\d{5,30}$/.test(datasetId)) {
    throw new MetaOnboardingError(
      `Dataset não resolvido para o WABA ${wabaId}`,
      {
        userMessage:
          "O WhatsApp foi conectado, mas o rastreamento de conversões ainda está sendo configurado.",
        retryable: true,
      },
    );
  }

  return datasetId;
}

export type OnboardingResult = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  businessId: string | null;
  datasetId: string | null;
  isOnBizApp: boolean | null;
  platformType: string | null;
  webhookSubscribed: boolean;
  accessToken: string;
  scopes: string[];
  // Preenchido quando o WhatsApp conectou mas o Dataset não pôde ser resolvido:
  // a conexão fica válida e o rastreamento entra em "configurando".
  datasetError: string | null;
  coexistenceWarning: string | null;
};

// Orquestra o onboarding inteiro.
//
// Quem decide o que foi conectado é o popup oficial da Meta: ele faz o login
// empresarial, lista as contas e mostra quais números são elegíveis, quais
// estão "não qualificados" e quais não podem ser compartilhados com o app.
// Esta função apenas confere que o resultado devolvido é legítimo e o aceita
// integralmente. Ela nunca escolhe um número, nunca oferece alternativas e
// nunca tenta contornar a elegibilidade decidida pela Meta.
//
// Depois disso, o que dá para automatizar é automatizado: WABA, número,
// webhook e Dataset, tudo no servidor, sem mais nenhuma tela.
export async function runOnboarding(input: {
  code: string;
  wabaId?: string | null;
  phoneNumberId?: string | null;
}): Promise<OnboardingResult> {
  const accessToken = await exchangeSignupCode(input.code);
  const introspection = await introspectToken(accessToken);

  // O id que veio do navegador só vale se a autorização realmente o conceder;
  // caso contrário um payload adulterado apontaria para o negócio de outro
  // cliente. Isso é validação de autorização, não escolha.
  const wabaId = resolveAuthorizedWaba({
    claimed: input.wabaId,
    authorized: introspection.wabaIds,
  });

  const [numbers, details] = await Promise.all([
    listPhoneNumbers(wabaId, accessToken),
    getWabaDetails(wabaId, accessToken).catch(() => ({
      name: null,
      businessId: null,
    })),
  ]);

  // Só o número que a Meta liberou, e apenas se ele estiver entre os que ela
  // compartilhou com o app para este WABA — o que também garante que ele
  // pertence ao WABA autorizado. Se a Meta não liberou nenhum, o número é
  // inelegível: nada é conectado e o cliente tenta de novo mais tarde.
  const chosen = resolveSharedNumber({
    claimed: input.phoneNumberId,
    numbers,
  });

  let webhookSubscribed = false;
  let datasetId: string | null = null;
  let datasetError: string | null = null;

  try {
    webhookSubscribed = await subscribeWabaWebhook(wabaId, accessToken);
  } catch (error) {
    datasetError =
      error instanceof Error ? error.message : "Falha ao assinar o webhook.";
  }

  try {
    datasetId = await resolveWabaDataset(wabaId, accessToken);
  } catch (error) {
    datasetError =
      error instanceof Error ? error.message : "Falha ao resolver o Dataset.";
  }

  return {
    wabaId,
    phoneNumberId: chosen.id,
    displayPhoneNumber: chosen.displayPhoneNumber,
    verifiedName: chosen.verifiedName ?? details.name,
    businessId: details.businessId,
    datasetId,
    isOnBizApp: chosen.isOnBizApp,
    platformType: chosen.platformType,
    webhookSubscribed,
    accessToken,
    scopes: introspection.scopes,
    datasetError,
    // A Meta só confirma Coexistence quando devolve o campo. `false` explícito
    // significa que o número NÃO está no app — o oposto do que queremos.
    coexistenceWarning:
      chosen.isOnBizApp === false
        ? "O número conectado não aparece como ativo no aplicativo WhatsApp Business."
        : null,
  };
}
