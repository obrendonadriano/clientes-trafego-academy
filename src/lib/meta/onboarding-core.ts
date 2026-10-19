// Núcleo do onboarding oficial do WhatsApp Business (Embedded Signup).
//
// Puro e sem dependências de runtime: as chamadas à Graph API, a seleção e o
// diagnóstico entram por injeção. Em produção quem chama é
// whatsapp-onboarding.ts (fetch real); nos testes, uma Meta simulada.
//
// Referências oficiais seguidas aqui:
//   - Embedded Signup > Implementation (FB.login, eventos de sessão, code de 30 s)
//   - Onboarding business customers as a Tech Provider:
//       GET /oauth/access_token?client_id&redirect_uri=&client_secret&code
//       (redirect_uri presente e VAZIO, como no sample oficial da Meta
//       fbsamples/business-messaging-sample-tech-provider-app)
//       POST /{WABA_ID}/subscribed_apps
//   - Onboard WhatsApp Business app users (Coexistence):
//       evento FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING traz só o waba_id;
//       NÃO registrar o número; sincronizar contatos e histórico em até 24 h:
//       POST /{PHONE_NUMBER_ID}/smb_app_data { sync_type: smb_app_state_sync | history }
//   - Conversions API for Business Messaging:
//       POST /{WABA_ID}/dataset (idempotente: devolve o Dataset já existente)
//   - Ads Pixel (o Dataset é um AdsPixel) > Updating:
//       POST /{DATASET_ID} { name }  — https://developers.facebook.com/docs/marketing-api/reference/ads-pixel/
//   - Compartilhar o Dataset com outra BM: POST /{DATASET_ID}/agencies
//       { business, permitted_tasks }, que exige business_management e um token
//       do dono do Dataset. O token do Embedded Signup não tem
//       business_management, então aqui só se LÊ /shared_agencies.
//       https://developers.facebook.com/docs/business-management-apis/business-asset-management/guides/business-pixel-sharing

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
  // BM da agência (META_AGENCY_BUSINESS_ID). Sem ela, não verifica
  // compartilhamento.
  agencyBusinessId?: string | null;
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
  // Nome do cliente no sistema (clients.nome_empresa), usado no Dataset.
  clientName?: string | null;
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
  // Nome do Dataset e resultado das tarefas best-effort sobre ele.
  datasetName: string | null;
  datasetNaming: DatasetNaming;
  datasetSharing: DatasetSharing;
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

// Nome que a Meta dá ao Dataset criado por POST /{WABA_ID}/dataset.
export const GENERIC_DATASET_NAME = /^\s*whatsapp marketing messages/i;

export function datasetDisplayName(clientName: string) {
  return `${clientName.trim().replace(/\s+/g, ' ').slice(0, 80)} · WhatsApp CAPI`;
}

export type DatasetNaming = {
  // renamed: renomeado agora ou já estava com o nosso nome (idempotente).
  // custom_name: o cliente deu outro nome; não mexemos.
  status: 'renamed' | 'custom_name' | 'failed' | 'skipped';
  reason: string | null;
};

export type DatasetSharing = {
  status: 'shared' | 'manual_required' | 'skipped';
  reason: string | null;
};

const MANUAL_SHARE_REASON =
  'Compartilhar por API exige business_management (POST /{dataset}/agencies), que o token do Embedded Signup não tem. Compartilhe pelo Business Manager do cliente.';

/**
 * 5b. Renomeia o Dataset para "<cliente> · WhatsApp CAPI", só se ele ainda
 *     tiver o nome genérico da Meta. Nunca lança: o resultado volta como
 *     status, e a recusa da Meta entra nos warnings.
 */
export async function ensureDatasetName(
  deps: OnboardingDeps,
  datasetId: string,
  accessToken: string,
  clientName: string | null | undefined,
  keep: (error: unknown) => void,
): Promise<{ name: string | null; naming: DatasetNaming }> {
  if (!clientName?.trim()) {
    return { name: null, naming: { status: 'skipped', reason: 'Nome do cliente ausente.' } };
  }

  const target = datasetDisplayName(clientName);
  let current: string | null = null;

  try {
    const payload = await deps.graph<{ name?: string }>(
      'read_dataset',
      `/${encodeURIComponent(datasetId)}`,
      { method: 'GET', accessToken, searchParams: { fields: 'name' } },
    );
    current = payload?.name?.trim() || null;
  } catch (error) {
    keep(error);
    return {
      name: null,
      naming: { status: 'failed', reason: reasonOf(deps, error) },
    };
  }

  if (current === target) {
    return { name: current, naming: { status: 'renamed', reason: null } };
  }

  if (current && !GENERIC_DATASET_NAME.test(current)) {
    return {
      name: current,
      naming: { status: 'custom_name', reason: 'O Dataset já tem um nome personalizado.' },
    };
  }

  try {
    await deps.graph<{ success?: boolean }>(
      'rename_dataset',
      `/${encodeURIComponent(datasetId)}`,
      { method: 'POST', accessToken, body: { name: target } },
    );
    return { name: target, naming: { status: 'renamed', reason: null } };
  } catch (error) {
    keep(error);
    return {
      name: current,
      naming: { status: 'failed', reason: reasonOf(deps, error) },
    };
  }
}

/**
 * 5c. Compartilhamento com a agência. Criar o compartilhamento exige
 *     business_management, que este token não tem; então só verificamos se
 *     a BM da agência já tem acesso (compartilhado à mão). Nunca lança.
 */
export async function checkDatasetSharing(
  deps: OnboardingDeps,
  datasetId: string,
  accessToken: string,
  keep: (error: unknown) => void,
): Promise<DatasetSharing> {
  const agency = deps.agencyBusinessId?.trim();

  if (!agency) {
    return { status: 'skipped', reason: 'META_AGENCY_BUSINESS_ID não configurado.' };
  }

  try {
    const payload = await deps.graph<{ data?: { id?: string }[] }>(
      'check_dataset_sharing',
      `/${encodeURIComponent(datasetId)}/shared_agencies`,
      { method: 'GET', accessToken, searchParams: { fields: 'id' } },
    );
    if ((payload?.data ?? []).some((business) => business.id === agency)) {
      return { status: 'shared', reason: null };
    }
  } catch (error) {
    keep(error);
  }

  return { status: 'manual_required', reason: MANUAL_SHARE_REASON };
}

function reasonOf(deps: OnboardingDeps, error: unknown) {
  return deps.diagnostics.isMetaGraphFailure(error)
    ? deps.diagnostics.failureAdminHint(error.failure)
    : 'Falha inesperada.';
}

/**
 * 1. Troca do code por token de negócio. O code do FB.login é trocado com
 *    redirect_uri presente e vazio, igual ao sample oficial da Meta. Sem o
 *    parâmetro a Meta recusava com 100/36008 ("redirect_uri is identical...").
 */
export async function exchangeCode(deps: OnboardingDeps, code: string) {
  const payload = await deps.graph<{ access_token?: string }>(
    'exchange_code',
    '/oauth/access_token',
    {
      method: 'GET',
      searchParams: {
        client_id: deps.appId,
        redirect_uri: '',
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

  // Best-effort: nome do Dataset e compartilhamento nunca mudam o status.
  // A falha de leitura do compartilhamento é esperada (falta de
  // business_management) e não entra no lastError do cliente.
  const sharingWarnings: Diagnostics.MetaFailure[] = [];
  const keepSharing = (error: unknown) => {
    if (!diagnostics.isMetaGraphFailure(error)) throw error;
    sharingWarnings.push(error.failure);
  };
  let datasetName: string | null = null;
  let datasetNaming: DatasetNaming = { status: 'skipped', reason: 'Dataset ainda não resolvido.' };
  let datasetSharing: DatasetSharing = { status: 'skipped', reason: 'Dataset ainda não resolvido.' };

  if (datasetId) {
    const naming = await ensureDatasetName(deps, datasetId, accessToken, input.clientName, keep);
    datasetName = naming.name;
    datasetNaming = naming.naming;
    datasetSharing = await checkDatasetSharing(deps, datasetId, accessToken, keepSharing);
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
    datasetName,
    datasetNaming,
    datasetSharing,
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
    warnings: [...warnings, ...sharingWarnings],
    lastError: notes.length > 0 ? notes.join(' | ') : null,
  };
}
