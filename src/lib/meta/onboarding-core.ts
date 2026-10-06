// Núcleo do onboarding oficial do WhatsApp Business (Embedded Signup).
//
// Puro e sem dependências de runtime: as chamadas à Graph API, a seleção e o
// diagnóstico entram por injeção. Em produção quem chama é
// whatsapp-onboarding.ts (fetch real); nos testes, uma Meta simulada.
//
// Referências oficiais seguidas aqui:
//   - Embedded Signup > Implementation (FB.login, eventos de sessão, code de 30 s)
//   - Onboarding business customers as a Tech Provider:
//       GET /oauth/access_token?client_id&client_secret&code   (sem redirect_uri)
//       POST /{WABA_ID}/subscribed_apps
//   - Onboard WhatsApp Business app users (Coexistence):
//       evento FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING traz só o waba_id;
//       NÃO registrar o número; sincronizar contatos e histórico em até 24 h:
//       POST /{PHONE_NUMBER_ID}/smb_app_data { sync_type: smb_app_state_sync | history }
//   - Conversions API for Business Messaging:
//       POST /{WABA_ID}/dataset (idempotente: devolve o Dataset já existente)

import type * as Diagnostics from './onboarding-diagnostics';
import type * as Selection from './onboarding-selection';

export type GraphInit = {
  method: 'GET' | 'POST';
  accessToken?: string;
  searchParams?: Record<string, string>;
  body?: Record<string, unknown>;
};

// Lança MetaGraphFailure (onboarding-diagnostics) quando a Meta recusa.
export type GraphCall = <T>(
  stage: Diagnostics.OnboardingStage,
  path: string,
  init: GraphInit,
) => Promise<T>;

export type OnboardingDeps = {
  graph: GraphCall;
  appId: string;
  appSecret: string;
  selection: Pick<
    typeof Selection,
    'assertManagementScope' | 'resolveAuthorizedWaba' | 'resolveSharedNumber' | 'BUSINESS_APP_EVENT'
  >;
  diagnostics: Pick<
    typeof Diagnostics,
    'isMetaGraphFailure' | 'failureAdminHint' | 'MetaGraphFailure'
  >;
};

export type OnboardingInput = {
  code: string;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  event?: Selection.SignupEvent | null;
  // Conexão já gravada para este cliente (reconexão). Usada só para não
  // repetir a sincronização de uma vez só do aplicativo WhatsApp Business.
  previous?: {
    phoneNumberId: string | null;
    businessAppSyncedAt: string | null;
  } | null;
};

export type ConnectionStatus = 'active' | 'dataset_pending' | 'attention_required';

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
  webhookAlreadySubscribed: boolean;
  accessToken: string;
  scopes: string[];
  businessApp: {
    expected: boolean;
    contactsSyncRequested: boolean;
    historySyncRequested: boolean;
    skippedAlreadySynced: boolean;
  };
  status: ConnectionStatus;
  // Falhas não fatais (webhook, Dataset, sincronização): a conexão continua
  // válida, mas o administrador precisa ver o motivo. Sem segredos.
  warnings: Diagnostics.MetaFailure[];
  lastError: string | null;
};

type DebugToken = {
  data?: {
    scopes?: string[];
    granular_scopes?: { scope: string; target_ids?: string[] }[];
  };
};

type PhoneNumbers = {
  data?: {
    id: string;
    display_phone_number?: string;
    verified_name?: string;
    is_on_biz_app?: boolean;
    platform_type?: string;
  }[];
};

type SubscribedApps = {
  data?: { whatsapp_business_api_data?: { id?: string } ; id?: string }[];
};

const DATASET_ID = /^\d{5,30}$/;

/** 1. Troca do code por token de negócio. Sem redirect_uri, como na doc. */
export async function exchangeCode(deps: OnboardingDeps, code: string) {
  const payload = await deps.graph<{ access_token?: string }>(
    'exchange_code',
    '/oauth/access_token',
    {
      method: 'GET',
      searchParams: {
        client_id: deps.appId,
        client_secret: deps.appSecret,
        code,
      },
    },
  );

  if (!payload?.access_token) {
    throw new deps.diagnostics.MetaGraphFailure({
      stage: 'exchange_code',
      kind: 'unknown',
      httpStatus: 200,
      metaCode: null,
      subcode: null,
      retryable: false,
    });
  }

  return payload.access_token;
}

/** 2. O que a autorização realmente concede (scopes e WABA granulares). */
export async function introspectToken(deps: OnboardingDeps, accessToken: string) {
  const payload = await deps.graph<DebugToken>('debug_token', '/debug_token', {
    method: 'GET',
    searchParams: {
      input_token: accessToken,
      access_token: `${deps.appId}|${deps.appSecret}`,
    },
  });

  const granular = payload?.data?.granular_scopes ?? [];

  return {
    scopes: payload?.data?.scopes ?? [],
    wabaIds: [
      ...new Set(
        granular
          .filter((item) => item.scope === 'whatsapp_business_management')
          .flatMap((item) => item.target_ids ?? []),
      ),
    ],
  };
}

/** 3. Números do WABA, com os campos oficiais de Coexistence. */
export async function listPhoneNumbers(
  deps: OnboardingDeps,
  wabaId: string,
  accessToken: string,
): Promise<Selection.ShareableNumber[]> {
  const payload = await deps.graph<PhoneNumbers>(
    'list_numbers',
    `/${encodeURIComponent(wabaId)}/phone_numbers`,
    {
      method: 'GET',
      accessToken,
      searchParams: {
        fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type',
      },
    },
  );

  return (payload?.data ?? []).map((row) => ({
    id: row.id,
    displayPhoneNumber: row.display_phone_number ?? null,
    verifiedName: row.verified_name ?? null,
    isOnBizApp: typeof row.is_on_biz_app === 'boolean' ? row.is_on_biz_app : null,
    platformType: row.platform_type ?? null,
  }));
}

/**
 * 4. Inscrição do app nos webhooks do WABA, sem duplicar: lê primeiro
 *    (GET subscribed_apps) e só inscreve se o app ainda não estiver lá.
 */
export async function ensureWebhookSubscription(
  deps: OnboardingDeps,
  wabaId: string,
  accessToken: string,
) {
  const path = `/${encodeURIComponent(wabaId)}/subscribed_apps`;
  let alreadySubscribed = false;

  try {
    const current = await deps.graph<SubscribedApps>('check_subscription', path, {
      method: 'GET',
      accessToken,
    });
    alreadySubscribed = (current?.data ?? []).some(
      (app) => (app.whatsapp_business_api_data?.id ?? app.id) === deps.appId,
    );
  } catch (error) {
    // Ler falhou: tentar inscrever mesmo assim é seguro (a inscrição é por app).
    if (!deps.diagnostics.isMetaGraphFailure(error)) throw error;
  }

  if (alreadySubscribed) {
    return { subscribed: true, alreadySubscribed: true };
  }

  const created = await deps.graph<{ success?: boolean }>('subscribe_webhook', path, {
    method: 'POST',
    accessToken,
  });

  return { subscribed: Boolean(created?.success), alreadySubscribed: false };
}

/** 5. Dataset do WABA (endpoint idempotente segundo a Meta). */
export async function resolveDataset(
  deps: OnboardingDeps,
  wabaId: string,
  accessToken: string,
) {
  const payload = await deps.graph<{ id?: string; data?: { id?: string }[] }>(
    'resolve_dataset',
    `/${encodeURIComponent(wabaId)}/dataset`,
    { method: 'POST', accessToken },
  );

  const datasetId = payload?.id ?? payload?.data?.[0]?.id ?? null;

  if (!datasetId || !DATASET_ID.test(datasetId)) {
    throw new deps.diagnostics.MetaGraphFailure({
      stage: 'resolve_dataset',
      kind: 'unknown',
      httpStatus: 200,
      metaCode: null,
      subcode: null,
      retryable: true,
    });
  }

  return datasetId;
}

/** 6. Sincronizações obrigatórias do aplicativo WhatsApp Business (24 h). */
export async function requestBusinessAppSync(
  deps: OnboardingDeps,
  phoneNumberId: string,
  accessToken: string,
  syncType: 'smb_app_state_sync' | 'history',
) {
  await deps.graph<unknown>(
    syncType === 'history' ? 'smb_sync_history' : 'smb_sync_contacts',
    `/${encodeURIComponent(phoneNumberId)}/smb_app_data`,
    {
      method: 'POST',
      accessToken,
      body: { messaging_product: 'whatsapp', sync_type: syncType },
    },
  );
}

/**
 * Orquestra o onboarding inteiro.
 *
 * Etapas fatais (sem elas não há conexão legítima): troca do code, leitura do
 * token, WABA autorizado, lista de números e o número liberado pela Meta.
 * Etapas não fatais (a conexão continua válida e o motivo fica registrado):
 * webhook, Dataset e sincronização do aplicativo WhatsApp Business.
 */
export async function runOnboardingCore(
  input: OnboardingInput,
  deps: OnboardingDeps,
): Promise<OnboardingResult> {
  const { selection, diagnostics } = deps;
  const accessToken = await exchangeCode(deps, input.code);
  const token = await introspectToken(deps, accessToken);

  selection.assertManagementScope(token.scopes);

  const wabaId = selection.resolveAuthorizedWaba({
    claimed: input.wabaId,
    authorized: token.wabaIds,
  });

  const [numbers, details] = await Promise.all([
    listPhoneNumbers(deps, wabaId, accessToken),
    deps
      .graph<{ name?: string; owner_business_info?: { id?: string } }>(
        'waba_details',
        `/${encodeURIComponent(wabaId)}`,
        { method: 'GET', accessToken, searchParams: { fields: 'id,name,owner_business_info' } },
      )
      .catch(() => null),
  ]);

  const chosen = selection.resolveSharedNumber({
    claimed: input.phoneNumberId,
    numbers,
    event: input.event ?? null,
  });

  const warnings: Diagnostics.MetaFailure[] = [];
  const keep = (error: unknown) => {
    if (!diagnostics.isMetaGraphFailure(error)) throw error;
    warnings.push(error.failure);
  };

  let webhookSubscribed = false;
  let webhookAlreadySubscribed = false;

  try {
    const result = await ensureWebhookSubscription(deps, wabaId, accessToken);
    webhookSubscribed = result.subscribed;
    webhookAlreadySubscribed = result.alreadySubscribed;
  } catch (error) {
    keep(error);
  }

  let datasetId: string | null = null;

  try {
    datasetId = await resolveDataset(deps, wabaId, accessToken);
  } catch (error) {
    keep(error);
  }

  const businessAppExpected =
    input.event === selection.BUSINESS_APP_EVENT || chosen.isOnBizApp === true;
  const alreadySynced = Boolean(
    input.previous?.businessAppSyncedAt &&
      input.previous.phoneNumberId === chosen.id,
  );
  let contactsSyncRequested = false;
  let historySyncRequested = false;

  if (businessAppExpected && !alreadySynced) {
    try {
      await requestBusinessAppSync(deps, chosen.id, accessToken, 'smb_app_state_sync');
      contactsSyncRequested = true;
    } catch (error) {
      keep(error);
    }

    try {
      await requestBusinessAppSync(deps, chosen.id, accessToken, 'history');
      historySyncRequested = true;
    } catch (error) {
      keep(error);
    }
  }

  const syncFailed =
    businessAppExpected && !alreadySynced && (!contactsSyncRequested || !historySyncRequested);

  // Sem webhook nenhum lead chega; sem sincronização a Meta desliga o número
  // em 24 h. Os dois pedem ação. Sem Dataset, o WhatsApp está conectado e o
  // rastreamento fica "configurando" até um novo retry.
  const status: ConnectionStatus =
    !webhookSubscribed || syncFailed
      ? 'attention_required'
      : datasetId
        ? 'active'
        : 'dataset_pending';

  const notes = warnings.map((failure) => diagnostics.failureAdminHint(failure));

  if (
    input.event === selection.BUSINESS_APP_EVENT &&
    chosen.platformType !== null &&
    chosen.platformType !== 'CLOUD_API'
  ) {
    notes.push(
      `Coexistence não confirmado: platform_type=${chosen.platformType} (esperado CLOUD_API).`,
    );
  }

  if (chosen.isOnBizApp === false) {
    notes.push('O número conectado não aparece como ativo no aplicativo WhatsApp Business.');
  }

  return {
    wabaId,
    phoneNumberId: chosen.id,
    displayPhoneNumber: chosen.displayPhoneNumber,
    verifiedName: chosen.verifiedName ?? details?.name ?? null,
    businessId: details?.owner_business_info?.id ?? null,
    datasetId,
    isOnBizApp: chosen.isOnBizApp,
    platformType: chosen.platformType,
    webhookSubscribed,
    webhookAlreadySubscribed,
    accessToken,
    scopes: token.scopes,
    businessApp: {
      expected: businessAppExpected,
      contactsSyncRequested,
      historySyncRequested,
      skippedAlreadySynced: businessAppExpected && alreadySynced,
    },
    status,
    warnings,
    lastError: notes.length > 0 ? notes.join(' | ') : null,
  };
}
