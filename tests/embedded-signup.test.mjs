import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as selection from '../src/lib/meta/onboarding-selection.ts';
import * as diagnostics from '../src/lib/meta/onboarding-diagnostics.ts';
import { runOnboardingCore } from '../src/lib/meta/onboarding-core.ts';
import {
  describeLoginOutcome,
  ensureFacebookSdk,
  waitForSessionEvent,
} from '../src/lib/meta/fb-sdk.ts';

// Embedded Signup do WhatsApp Business com a Meta SIMULADA.
//
// Cada etapa (exchange_code, debug_token, list_numbers, ...) responde o que o
// teste mandar. Assim dá para provar o fluxo inteiro — inclusive as recusas
// de segurança e as falhas não fatais — sem tocar na Meta de verdade.

const APP_ID = '123456789';
const TOKEN = 'EAAtestBusinessTokenThatMustNeverLeak0123456789';
const WABA = '111111';
const OTHER_WABA = '222222';
const PHONE = '555001';

const phone = (id, extra = {}) => ({
  id,
  display_phone_number: '+55 14 99999-0001',
  verified_name: 'Loja Teste',
  is_on_biz_app: true,
  platform_type: 'CLOUD_API',
  ...extra,
});

const ok = {
  exchange_code: { access_token: TOKEN, token_type: 'bearer' },
  debug_token: {
    data: {
      scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
      granular_scopes: [
        { scope: 'whatsapp_business_management', target_ids: [WABA] },
        { scope: 'whatsapp_business_messaging', target_ids: [WABA] },
      ],
    },
  },
  list_numbers: { data: [phone(PHONE)] },
  waba_details: { id: WABA, name: 'Loja Teste', owner_business_info: { id: '999999' } },
  check_subscription: { data: [] },
  subscribe_webhook: { success: true },
  resolve_dataset: { id: '777777' },
  smb_sync_contacts: { success: true },
  smb_sync_history: { success: true },
};

// Resposta de erro no formato da Graph API.
const fail = (httpStatus, metaCode, subcode = null, message = 'erro simulado') => ({
  __fail: { httpStatus, metaCode, subcode, message },
});

function fakeMeta(overrides = {}) {
  const calls = [];
  const routes = { ...ok, ...overrides };

  const graph = async (stage, path, init) => {
    calls.push({ stage, path, init });
    const route = routes[stage];
    const value = typeof route === 'function' ? route({ path, init, calls }) : route;

    if (value && value.__fail) {
      throw new diagnostics.MetaGraphFailure(
        diagnostics.classifyMetaError({ stage, ...value.__fail }),
      );
    }

    return structuredClone(value);
  };

  return {
    calls,
    deps: { graph, appId: APP_ID, appSecret: 'app-secret-test', selection, diagnostics },
    stages: () => calls.map((call) => call.stage),
  };
}

const run = (meta, input = {}) =>
  runOnboardingCore(
    { code: 'AQDcode', wabaId: WABA, phoneNumberId: PHONE, event: 'FINISH', ...input },
    meta.deps,
  );

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('deveria ter recusado');
}

// ---------------------------------------------------------------------------
// 1–2. SDK do Facebook
// ---------------------------------------------------------------------------

test('1. SDK já carregado antes de entrar na página: fica pronto sem esperar onLoad', () => {
  let inits = 0;
  const host = { FB: { init: () => inits++, login: () => {} } };

  assert.equal(ensureFacebookSdk(host, { appId: APP_ID, version: 'v26.0' }), true);
  // Montar de novo (navegação dentro do app) não reinicializa.
  assert.equal(ensureFacebookSdk(host, { appId: APP_ID, version: 'v26.0' }), true);
  assert.equal(inits, 1);
});

test('2. SDK carregando pela primeira vez: espera o script e inicializa uma vez', () => {
  let inits = 0;
  const host = {};

  assert.equal(ensureFacebookSdk(host, { appId: APP_ID, version: 'v26.0' }), false);
  host.FB = { init: (options) => { inits++; assert.equal(options.appId, APP_ID); }, login: () => {} };
  assert.equal(ensureFacebookSdk(host, { appId: APP_ID, version: 'v26.0' }), true);
  assert.equal(ensureFacebookSdk(host, { appId: APP_ID, version: 'v26.0' }), true);
  assert.equal(inits, 1);
  // Sem appId/versão não há como inicializar: nunca fica "pronto" pela metade.
  assert.equal(ensureFacebookSdk({ FB: host.FB }, { appId: '', version: 'v26.0' }), false);
});

test('FB.login usa Embedded Signup v4 com o onboarding do app WhatsApp Business', () => {
  const screen = readFileSync(
    new URL('../src/components/conversions/whatsapp-official-connection.tsx', import.meta.url),
    'utf8',
  );
  const login = screen.slice(screen.indexOf('window.FB?.login('));
  // O bloco extras inteiro cabe nos ~600 caracteres após "extras: {".
  const start = login.indexOf('extras: {');
  const extras = login.slice(start, start + 600);
  assert.match(login, /config_id: configId/);
  assert.match(login, /response_type: "code"/);
  assert.match(login, /override_default_response_type: true/);
  assert.match(extras, /setup: \{\}/);
  assert.match(extras, /featureType: "whatsapp_business_app_onboarding"/);
  assert.match(extras, /sessionInfoVersion: "3"/);
  assert.match(extras, /version: "v4"/);
  // Fora do escopo desta etapa: nada de app_only_install nem features.
  assert.equal(/app_only_install|features:/.test(screen), false);
});

test('o componente usa onReady e reconhece o SDK já carregado na montagem', () => {
  const screen = readFileSync(
    new URL('../src/components/conversions/whatsapp-official-connection.tsx', import.meta.url),
    'utf8',
  );
  assert.match(screen, /onReady=\{markSdkReady\}/);
  assert.match(screen, /useState\(\s*\(\)\s*=>\s*typeof window !== "undefined" &&\s*ensureFacebookSdk/);
});

// ---------------------------------------------------------------------------
// 3–5. Janela da Meta e eventos de sessão
// ---------------------------------------------------------------------------

test('3. popup cancelado, fechado ou com erro não envia nada ao servidor', () => {
  assert.deepEqual(
    describeLoginOutcome(undefined, { event: 'CANCEL', currentStep: 'PHONE_NUMBER_SETUP', errorMessage: null }),
    { kind: 'cancelled', atStep: 'PHONE_NUMBER_SETUP' },
  );
  assert.deepEqual(describeLoginOutcome(undefined, null), { kind: 'closed' });
  assert.deepEqual(
    describeLoginOutcome(null, { event: 'ERROR', currentStep: null, errorMessage: 'falhou' }),
    { kind: 'error', message: 'falhou' },
  );
  assert.deepEqual(describeLoginOutcome('AQDcode', null), { kind: 'code', code: 'AQDcode' });
});

test('eventos só são aceitos de https://*.facebook.com e do tipo WA_EMBEDDED_SIGNUP', () => {
  const payload = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: WABA, phone_number_id: PHONE } };

  assert.equal(selection.parseSignupMessage('https://evil.example.com', payload), null);
  assert.equal(selection.parseSignupMessage('http://www.facebook.com', payload), null);
  assert.equal(selection.parseSignupMessage('https://facebook.com.evil.com', payload), null);
  assert.equal(selection.parseSignupMessage('https://www.facebook.com', { type: 'OUTRO' }), null);
  assert.equal(selection.parseSignupMessage('https://www.facebook.com', 'não é json'), null);
  assert.equal(selection.parseSignupMessage('https://web.facebook.com', JSON.stringify(payload)).wabaId, WABA);
});

test('4. FINISH normal: WABA e número devolvidos pela Meta conectam com tudo ativo', async () => {
  const session = selection.parseSignupMessage('https://www.facebook.com', {
    type: 'WA_EMBEDDED_SIGNUP',
    event: 'FINISH',
    data: { waba_id: WABA, phone_number_id: PHONE },
  });
  assert.equal(session.event, 'FINISH');

  const meta = fakeMeta();
  const result = await run(meta, { wabaId: session.wabaId, phoneNumberId: session.phoneNumberId });

  assert.equal(result.wabaId, WABA);
  assert.equal(result.phoneNumberId, PHONE);
  assert.equal(result.datasetId, '777777');
  assert.equal(result.webhookSubscribed, true);
  assert.equal(result.status, 'active');
  assert.equal(result.isOnBizApp, true);
  assert.equal(result.platformType, 'CLOUD_API');
  // A troca do code segue o sample oficial da Meta: redirect_uri presente e vazio.
  const exchange = meta.calls.find((call) => call.stage === 'exchange_code');
  assert.deepEqual(Object.keys(exchange.init.searchParams).sort(), ['client_id', 'client_secret', 'code', 'redirect_uri']);
  assert.equal(exchange.init.searchParams.redirect_uri, '');
  // Nenhum número foi registrado (/register): número do app não é registrado.
  assert.equal(meta.calls.some((call) => call.path.endsWith('/register')), false);
});

test('5. FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING: só o WABA vem, o número é o único do app', async () => {
  const session = selection.parseSignupMessage('https://www.facebook.com', {
    type: 'WA_EMBEDDED_SIGNUP',
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    data: { waba_id: WABA },
    version: 3,
  });
  assert.equal(session.phoneNumberId, null);

  const meta = fakeMeta();
  const result = await run(meta, { wabaId: session.wabaId, phoneNumberId: null, event: session.event });

  assert.equal(result.phoneNumberId, PHONE);
  assert.equal(result.status, 'active');
  // As duas sincronizações obrigatórias (24 h) foram pedidas, no número certo.
  const syncs = meta.calls.filter((call) => call.stage.startsWith('smb_sync'));
  assert.deepEqual(syncs.map((call) => call.init.body.sync_type), ['smb_app_state_sync', 'history']);
  assert.ok(syncs.every((call) => call.path === `/${PHONE}/smb_app_data`));
  assert.ok(syncs.every((call) => call.init.body.messaging_product === 'whatsapp'));
  assert.equal(result.businessApp.contactsSyncRequested, true);
  assert.equal(result.businessApp.historySyncRequested, true);
});

// ---------------------------------------------------------------------------
// 6–10. Validação do que a Meta devolveu
// ---------------------------------------------------------------------------

test('6. waba_id ausente: só vale o WABA único concedido pelo token; com vários, não escolhe', async () => {
  const single = await run(fakeMeta(), { wabaId: null });
  assert.equal(single.wabaId, WABA);

  const meta = fakeMeta({
    debug_token: {
      data: {
        scopes: ['whatsapp_business_management'],
        granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: [WABA, OTHER_WABA] }],
      },
    },
  });
  const error = await rejection(run(meta, { wabaId: null }));
  assert.equal(error.reason, 'ambiguous_waba');
});

test('7. phone_number_id ausente no FINISH normal: nada é conectado e nenhum número é escolhido', async () => {
  const meta = fakeMeta({ list_numbers: { data: [phone(PHONE), phone('555002')] } });
  const error = await rejection(run(meta, { phoneNumberId: null, event: 'FINISH' }));
  assert.equal(error.reason, 'no_number');
  assert.equal(meta.stages().includes('resolve_dataset'), false);
});

test('8. WABA que o token não concede é recusado (payload adulterado)', async () => {
  const error = await rejection(run(fakeMeta(), { wabaId: OTHER_WABA }));
  assert.ok(error instanceof selection.OnboardingRejected);
  assert.equal(error.reason, 'waba_mismatch');
  assert.equal(error.retryable, false);
});

test('9. número que não pertence ao WABA autorizado é recusado', async () => {
  const error = await rejection(run(fakeMeta(), { phoneNumberId: '999001' }));
  assert.equal(error.reason, 'number_not_shared');
});

test('10. número inelegível/não compartilhado: mensagem amigável e nova tentativa', async () => {
  // FINISH_ONLY_WABA: conta autorizada, nenhum número liberado.
  const none = await rejection(run(fakeMeta({ list_numbers: { data: [] } }), { phoneNumberId: null, event: 'FINISH_ONLY_WABA' }));
  assert.equal(none.reason, 'no_number');
  assert.equal(none.retryable, true);
  assert.match(none.userMessage, /continua funcionando normalmente/);

  // Coexistence com mais de um número: não há como saber qual — não escolhe.
  const many = await rejection(
    run(fakeMeta({ list_numbers: { data: [phone(PHONE), phone('555002')] } }), {
      phoneNumberId: null,
      event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    }),
  );
  assert.equal(many.reason, 'business_app_number_unresolved');

  // Coexistence sem a Meta confirmar que o número segue no app.
  const notOnApp = await rejection(
    run(fakeMeta({ list_numbers: { data: [phone(PHONE, { is_on_biz_app: false })] } }), {
      phoneNumberId: null,
      event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    }),
  );
  assert.equal(notOnApp.reason, 'business_app_number_not_on_app');

  for (const error of [none, many, notOnApp]) {
    assert.equal(/WABA|Dataset|CAPI|token|phone_number_id/i.test(error.userMessage), false);
  }
});

// ---------------------------------------------------------------------------
// 11–16. Autorização e token
// ---------------------------------------------------------------------------

test('11. code OAuth inválido/expirado vira "conecte novamente"', async () => {
  const error = await rejection(
    run(fakeMeta({ exchange_code: fail(400, 100, 36007, 'This authorization code has expired.') })),
  );
  assert.ok(diagnostics.isMetaGraphFailure(error));
  assert.equal(error.failure.stage, 'exchange_code');
  assert.equal(error.failure.kind, 'code_invalid');
  assert.match(diagnostics.failureUserMessage(error.failure), /expirou/);
});

test('12. erro de redirect_uri da Meta é diagnosticado como configuração, não como código', async () => {
  const error = await rejection(
    run(
      fakeMeta({
        exchange_code: fail(
          400,
          100,
          null,
          'Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request',
        ),
      }),
    ),
  );
  assert.equal(error.failure.kind, 'redirect_uri_mismatch');
  assert.equal(error.failure.retryable, false);
  const hint = diagnostics.failureAdminHint(error.failure);
  assert.match(hint, /Facebook Login for Business/);
  assert.match(hint, /já envia redirect_uri vazio/);
  // O log seguro tem etapa, status e códigos — e nada além disso.
  assert.deepEqual(diagnostics.failureLogPayload(error.failure), {
    stage: 'exchange_code',
    kind: 'redirect_uri_mismatch',
    httpStatus: 400,
    metaCode: 100,
    subcode: null,
    retryable: false,
  });
});

test('13. access token inválido é recusado sem conectar nada', async () => {
  const meta = fakeMeta({ debug_token: fail(400, 190, 463, 'Error validating access token') });
  const error = await rejection(run(meta));
  assert.equal(error.failure.kind, 'token_invalid');
  assert.equal(meta.stages().includes('list_numbers'), false);
});

test('14. token sem whatsapp_business_management é recusado', async () => {
  const meta = fakeMeta({
    debug_token: {
      data: {
        scopes: ['whatsapp_business_messaging'],
        granular_scopes: [{ scope: 'whatsapp_business_messaging', target_ids: [WABA] }],
      },
    },
  });
  const error = await rejection(run(meta));
  assert.equal(error.reason, 'missing_management_scope');
});

test('15. token sem WABA granular: o id do navegador nunca é aceito sozinho', async () => {
  const meta = fakeMeta({
    debug_token: { data: { scopes: ['whatsapp_business_management'], granular_scopes: [] } },
  });
  const error = await rejection(run(meta, { wabaId: WABA }));
  assert.equal(error.reason, 'no_waba');
});

test('16. listagem de números falhando interrompe o onboarding com diagnóstico', async () => {
  const meta = fakeMeta({ list_numbers: fail(500, 2, null, 'Service temporarily unavailable') });
  const error = await rejection(run(meta));
  assert.equal(error.failure.stage, 'list_numbers');
  assert.equal(error.failure.kind, 'transient');
  assert.equal(error.failure.retryable, true);
  assert.equal(meta.stages().includes('resolve_dataset'), false);
});

// ---------------------------------------------------------------------------
// 17–20. Etapas não fatais e reconexão
// ---------------------------------------------------------------------------

test('17. subscribed_apps falhando: conexão válida, mas "atenção" com diagnóstico claro', async () => {
  const meta = fakeMeta({ subscribe_webhook: fail(403, 200, null, 'Permissions error') });
  const result = await run(meta);

  assert.equal(result.webhookSubscribed, false);
  assert.equal(result.status, 'attention_required');
  assert.equal(result.datasetId, '777777');
  assert.equal(result.warnings[0].stage, 'subscribe_webhook');
  assert.match(result.lastError, /subscribe_webhook/);
});

test('webhook já inscrito não é inscrito de novo', async () => {
  const meta = fakeMeta({ check_subscription: { data: [{ whatsapp_business_api_data: { id: APP_ID, name: 'App' } }] } });
  const result = await run(meta);
  assert.equal(result.webhookSubscribed, true);
  assert.equal(result.webhookAlreadySubscribed, true);
  assert.equal(meta.stages().includes('subscribe_webhook'), false);
});

test('18. Dataset funcionando: id do WABA, endpoint oficial idempotente', async () => {
  const meta = fakeMeta();
  const result = await run(meta);
  const dataset = meta.calls.find((call) => call.stage === 'resolve_dataset');
  assert.equal(dataset.path, `/${WABA}/dataset`);
  assert.equal(dataset.init.method, 'POST');
  assert.equal(result.datasetId, '777777');
});

test('19. Dataset falhando: WhatsApp conectado, rastreamento em dataset_pending', async () => {
  // Ex.: falta whatsapp_business_manage_events, que o endpoint de Dataset exige.
  const result = await run(fakeMeta({ resolve_dataset: fail(403, 200, null, 'Requires whatsapp_business_manage_events') }));
  assert.equal(result.datasetId, null);
  assert.equal(result.status, 'dataset_pending');
  assert.equal(result.phoneNumberId, PHONE);
  assert.equal(result.warnings[0].kind, 'missing_permission');
});

test('20. reconexão do mesmo WABA/número não repete a sincronização de uma vez só', async () => {
  const meta = fakeMeta();
  const result = await run(meta, {
    phoneNumberId: null,
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    previous: { phoneNumberId: PHONE, businessAppSyncedAt: '2026-10-06T10:00:00Z' },
  });
  assert.equal(result.status, 'active');
  assert.equal(result.businessApp.skippedAlreadySynced, true);
  assert.equal(meta.stages().some((stage) => stage.startsWith('smb_sync')), false);

  // Número diferente na reconexão: a sincronização é pedida para o novo.
  const other = fakeMeta();
  await run(other, {
    phoneNumberId: null,
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    previous: { phoneNumberId: '555999', businessAppSyncedAt: '2026-10-06T10:00:00Z' },
  });
  assert.equal(other.stages().filter((stage) => stage.startsWith('smb_sync')).length, 2);
});

test('sincronização recusada pela Meta deixa a conexão em "atenção" (risco das 24 h)', async () => {
  const result = await run(fakeMeta({ smb_sync_history: fail(400, 100, null, 'Invalid parameter') }), {
    phoneNumberId: null,
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
  });
  assert.equal(result.businessApp.contactsSyncRequested, true);
  assert.equal(result.businessApp.historySyncRequested, false);
  assert.equal(result.status, 'attention_required');
});

// ---------------------------------------------------------------------------
// 21–25. Multi-tenant, segredos, retry e desconexão
// ---------------------------------------------------------------------------

const route = readFileSync(new URL('../src/app/api/whatsapp/embedded-signup/route.ts', import.meta.url), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('21/22. WABA ou número de outro cliente: o banco recusa e a rota responde 409', () => {
  // O conflito é garantido no SQL (meta_save_whatsapp_connection, coberto em
  // conversion-events.test.mjs > TESTE C). Aqui: o client_id sai da sessão e
  // o 23505 vira recusa, sem estado pela metade.
  const code = stripComments(route);
  assert.match(code, /const clientId = user\.clientId;/);
  assert.equal(/body\.clientId|body\.client_id/.test(code), false);
  assert.match(code, /error\.code === "23505"/);
  assert.match(code, /status: duplicate \? 409 : 500/);
});

test('23. o token nunca aparece em resposta, log ou diagnóstico', async () => {
  const logged = [];
  const original = { error: console.error, warn: console.warn, log: console.log };
  console.error = console.warn = console.log = (...args) => logged.push(JSON.stringify(args));

  try {
    const result = await run(fakeMeta({ resolve_dataset: fail(403, 200), subscribe_webhook: fail(500, 2) }));
    for (const warning of result.warnings) {
      console.warn(diagnostics.failureLogLabel(warning), diagnostics.failureLogPayload(warning));
    }
    const exchangeError = await rejection(run(fakeMeta({ exchange_code: fail(400, 100, null, `bad code AQDcode token ${TOKEN}`) })));
    console.error(diagnostics.failureLogLabel(exchangeError.failure), diagnostics.failureLogPayload(exchangeError.failure));

    const everything = logged.join('\n') + JSON.stringify(result.warnings) + (result.lastError ?? '') + exchangeError.message;
    assert.equal(everything.includes(TOKEN), false);
    assert.equal(everything.includes('app-secret-test'), false);
    assert.equal(everything.includes('AQDcode'), false);
  } finally {
    Object.assign(console, original);
  }

  // A rota guarda o token cifrado e nunca o devolve.
  assert.equal(route.includes('sealSecret(result.accessToken)'), true);
  assert.equal(/Response\.json\([\s\S]{0,400}accessToken/.test(stripComments(route).replace(/sealSecret\(result\.accessToken\)/g, '')), false);

  // Rede de segurança para qualquer texto que vá para o banco.
  const redacted = diagnostics.redactSecrets(`Bearer ${TOKEN} access_token=${TOKEN}&code=AQDcode client_secret=abc`);
  assert.equal(redacted.includes(TOKEN), false);
  assert.equal(redacted.includes('AQDcode'), false);
  assert.equal(redacted.includes('client_secret=abc'), false);
});

test('24. retry com conexão ativa: uma tentativa que falha não derruba a conexão', () => {
  const code = stripComments(route);
  // Lê o estado anterior e, se estava conectado, mantém o status e só
  // registra o motivo da falha.
  assert.match(code, /const wasConnected = previous\?\.status \? isConnected\(previous\.status\) : false;/);
  assert.match(code, /const keep = wasConnected && previous\?\.status \? previous\.status : status;/);
  assert.match(code, /if \(!wasConnected\) \{\s*await setStatus\("onboarding", null\);/);
});

test('25. desconectar apaga a credencial sem apagar o histórico (SQL)', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260924210000_official_whatsapp_conversions.sql', import.meta.url),
    'utf8',
  );
  const disconnect = migration.slice(
    migration.indexOf('create or replace function public.meta_disconnect_whatsapp'),
    migration.indexOf('revoke all on function public.meta_disconnect_whatsapp'),
  );
  assert.match(disconnect, /delete from private\.client_whatsapp_credentials/);
  assert.equal(/delete from public\.conversion_leads|delete from public\.client_whatsapp_connections/.test(disconnect), false);
});

// ---------------------------------------------------------------------------
// Diagnóstico e tempo
// ---------------------------------------------------------------------------

test('a espera pelo evento de sessão é curta e não trava sem ele', async () => {
  let ticks = 0;
  const sleep = async () => { ticks++; };
  assert.equal(await waitForSessionEvent(() => false, { timeoutMs: 500, stepMs: 100, sleep }), false);
  assert.equal(ticks, 5);
  assert.equal(await waitForSessionEvent(() => true, { sleep }), true);
});

test('classificação de erros da Meta cobre limites, instabilidade e permissão', () => {
  const kind = (input) => diagnostics.classifyMetaError({ stage: 'list_numbers', ...input }).kind;
  assert.equal(kind({ httpStatus: 400, metaCode: 4 }), 'rate_limited');
  assert.equal(kind({ httpStatus: 503, metaCode: null }), 'transient');
  assert.equal(kind({ httpStatus: 403, metaCode: 10 }), 'missing_permission');
  assert.equal(kind({ httpStatus: 400, metaCode: 190 }), 'token_invalid');
  assert.equal(kind({ httpStatus: 400, metaCode: 999 }), 'unknown');
});

// ---------------------------------------------------------------------------
// whatsapp_business_manage_events ainda NÃO aprovada (App Review separado)
// ---------------------------------------------------------------------------

test('sem whatsapp_business_manage_events o cliente conecta WABA + número normalmente', async () => {
  // O token do fixture tem só management + messaging, como hoje.
  const meta = fakeMeta({
    resolve_dataset: fail(403, 200, null, '(#200) Requires whatsapp_business_manage_events permission'),
  });
  const result = await run(meta);

  assert.equal(result.phoneNumberId, PHONE);
  assert.equal(result.wabaId, WABA);
  assert.equal(result.webhookSubscribed, true);
  // Não é falha do onboarding: fica dataset_pending, não attention_required.
  assert.equal(result.status, 'dataset_pending');
  assert.equal(result.datasetId, null);
  assert.match(result.lastError, /whatsapp_business_manage_events/);
  assert.match(result.lastError, /App Review separado/);
  assert.match(result.lastError, /continuam conectados/);
  // O código não pede a permissão: só lê o que o token concede.
  const core = readFileSync(new URL('../src/lib/meta/onboarding-core.ts', import.meta.url), 'utf8');
  assert.equal(stripComments(core).includes('whatsapp_business_manage_events'), false);
});

// ---------------------------------------------------------------------------
// VehicleAcquired: nunca vira Purchase, nunca leva valor
// ---------------------------------------------------------------------------

test('VehicleAcquired segue fora de Business Messaging, sem valor e sem virar Purchase', async () => {
  const payload = await import('../src/lib/conversions/capi-payload.ts');
  const event = payload.buildServerEvent({
    lead_id: 'l1',
    dataset_id: '777777',
    waba_id: WABA,
    access_token: null,
    event_name: 'VehicleAcquired',
    event_id: 'e1',
    event_time: 1791000000,
    action_source: 'other',
    user_data: { ph: ['a'.repeat(64)] },
    custom_data: { value: 30000, currency: 'BRL' },
  });

  assert.equal(event.event_name, 'VehicleAcquired');
  assert.equal(event.action_source, 'other');
  assert.equal('custom_data' in event, false);
  assert.equal('messaging_channel' in event, false);
  // VehicleAcquired não é aceito no canal de mensagens, e nada o reescreve.
  assert.throws(() =>
    payload.buildServerEvent({
      lead_id: 'l1', dataset_id: '777777', waba_id: WABA, access_token: null,
      event_name: 'VehicleAcquired', event_id: 'e2', event_time: 1791000000,
      action_source: 'business_messaging',
      user_data: { ctwa_clid: 'clid', whatsapp_business_account_id: WABA },
    }),
  );
  const source = readFileSync(new URL('../src/lib/conversions/capi-payload.ts', import.meta.url), 'utf8');
  assert.equal(/VehicleAcquired['"]\s*\?\s*['"]Purchase|event_name\s*=\s*['"]Purchase/.test(source), false);
});

test('o teste controlado no Test Events só envia com código, confirmação e sem valor no VehicleAcquired', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const script = fileURLToPath(new URL('../scripts/capi-test-event.mjs', import.meta.url));
  const runScript = (extra) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [script, ...extra], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CAPI_TEST_ACCESS_TOKEN: '' } }) };
    } catch (error) {
      return { code: error.status, out: `${error.stdout}${error.stderr}` };
    }
  };
  const base = ['--event', 'VehicleAcquired', '--dataset', '1234567', '--phone', '5514999990000'];

  const dry = runScript(base);
  assert.equal(dry.code, 0);
  assert.match(dry.out, /SIMULAÇÃO: nada foi enviado/);
  assert.match(dry.out, /"action_source": "other"/);
  assert.equal(/custom_data|"value"/.test(dry.out), false);

  assert.notEqual(runScript([...base, '--value', '30000', '--currency', 'BRL']).code, 0);
  assert.notEqual(runScript([...base, '--send']).code, 0);
  assert.notEqual(runScript([...base, '--send', '--test-event-code', 'T1']).code, 0);
  assert.notEqual(runScript([...base, '--send', '--test-event-code', 'T1', '--confirm']).code, 0);
});
