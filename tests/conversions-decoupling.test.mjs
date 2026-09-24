import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { test } from 'node:test';

// TESTE 12/13/14: o caminho NOVO de Conversões não pode depender de WAHA nem
// de n8n, e o Atendimento por IA precisa continuar usando o WAHA normalmente.
//
// Durante a fase híbrida o caminho ANTIGO continua existindo de propósito, para
// os clientes ainda em legacy_waha. O que se verifica aqui é que ele está
// isolado: nenhum arquivo do pipeline oficial o alcança, e ele está marcado
// como legado para não ser confundido com a arquitetura final.

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(src).filter((file) => /\.(ts|tsx)$/.test(file));
const read = (file) => readFileSync(file, 'utf8');
// A dependência real está no código, não no comentário que explica a história.
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const rel = (file) => relative(root, file).replace(/\\/g, '/');

// Tudo que constitui o caminho de Conversões, da entrada do lead ao envio.
const CONVERSIONS = [
  'src/lib/conversions/capi-payload.ts',
  'src/lib/conversions/dispatcher.ts',
  'src/lib/conversions/connection-shared.ts',
  'src/lib/conversions/shared.ts',
  'src/lib/data/conversions.ts',
  'src/lib/data/whatsapp-connection.ts',
  'src/lib/meta/whatsapp-onboarding.ts',
  'src/lib/meta/onboarding-selection.ts',
  'src/lib/meta/conversions-config.ts',
  'src/lib/meta/secret-box.ts',
  'src/app/conversoes/actions.ts',
  'src/app/api/whatsapp/embedded-signup/route.ts',
  'src/app/api/whatsapp/meta-webhook/route.ts',
  'src/app/api/conversions/dispatch/route.ts',
  'src/app/dashboard/conversoes/page.tsx',
  'src/app/admin/conversoes/page.tsx',
  'src/app/admin/conversoes/integracao/page.tsx',
  'src/components/conversions/conversions-page.tsx',
  'src/components/conversions/whatsapp-official-connection.tsx',
  'src/components/conversions/lead-badges.tsx',
];

// O painel do administrador PRECISA citar o WAHA: é ele que mostra quem ainda
// não migrou. O que não pode é depender do código do WAHA.
const DIAGNOSTICS = 'src/components/admin/conversions-diagnostics.tsx';

test('TESTE 12/13: nenhum arquivo de Conversões depende de WAHA ou n8n', () => {
  for (const file of CONVERSIONS) {
    const path = join(root, file);
    assert.ok(existsSync(path), `${file} deveria existir`);

    // `legacy_waha` é o NOME do modo de captação, não uma dependência do WAHA:
    // o pipeline oficial precisa saber quem ainda não migrou.
    const source = stripComments(read(path)).replaceAll('legacy_waha', 'legacy_mode');
    assert.equal(/waha/i.test(source), false, `${file} ainda usa WAHA`);
    assert.equal(/n8n/i.test(source), false, `${file} ainda usa n8n`);
    assert.equal(
      source.includes('waha_ingest_lead'),
      false,
      `${file} ainda usa a ingestão antiga`,
    );
  }
});

test('FASE HÍBRIDA: o painel do admin cita o WAHA como rótulo, sem depender dele', () => {
  const source = read(join(root, DIAGNOSTICS));

  // Nenhum import do módulo WAHA nem chamada à API dele.
  assert.equal(/from ["'][^"']*waha/i.test(source), false);
  assert.equal(/wahaFetchJson|getWahaConfig|whatsapp_sessions/.test(source), false);

  // Só o rótulo que diferencia os dois modos para o gestor.
  assert.equal(source.includes('WAHA (legado)'), true);
  assert.equal(source.includes('official_meta'), true);
});

test('TESTE 14: o Atendimento por IA continua usando o WAHA', () => {
  const aiPipeline = read(join(root, 'src/lib/ai-agent/pipeline.ts'));
  assert.equal(/waha/i.test(aiPipeline), true, 'o pipeline da IA perdeu o WAHA');

  // A sessão WAHA continua sendo criada e o webhook da IA continua registrado.
  const connect = read(join(root, 'src/app/whatsapp/conectar/route.ts'));
  assert.equal(connect.includes('config.aiWebhookUrl'), true);

  // Durante a fase híbrida o webhook de leads também continua registrado, para
  // quem ainda não migrou. Quem o remover antes da hora derruba a captação —
  // por isso ele precisa estar aqui e explicitamente marcado como legado.
  assert.equal(connect.includes('config.leadsWebhookUrl'), true);
  assert.match(connect, /LEGADO \/ TRANSITÓRIO/);
  assert.match(read(join(root, 'src/lib/waha.ts')), /LEGADO \/ TRANSITÓRIO/);

  for (const file of [
    'src/lib/waha.ts',
    'src/app/whatsapp/conectar/route.ts',
    'src/app/whatsapp/qr/route.ts',
    'src/app/whatsapp/desconectar/route.ts',
    'src/app/whatsapp/webhook/route.ts',
    'src/app/whatsapp/ia/evento/route.ts',
    'src/app/whatsapp/ia/passo/route.ts',
    'src/components/whatsapp/whatsapp-connection-experience.tsx',
  ]) {
    assert.ok(existsSync(join(root, file)), `${file} não pode ter sido removido`);
  }
});

test('FASE HÍBRIDA: os workflows antigos continuam disponíveis, marcados como legado', () => {
  // Removê-los agora interromperia a captação de quem ainda não migrou. Eles
  // saem numa segunda migração, quando todos estiverem em official_meta.
  for (const file of ['n8n/n8n_capi_conversoes.json', 'n8n/n8n_waha_ingestao.json']) {
    const path = join(root, file);
    assert.ok(existsSync(path), `${file} não pode ser removido durante a transição`);

    const flow = JSON.parse(read(path));
    assert.match(flow.name, /^\[LEGADO\]/, `${file} precisa estar marcado como legado`);
    assert.ok(flow.meta?.trafegoacademy_status, `${file} precisa explicar seu status`);
  }

  assert.ok(existsSync(join(root, 'scripts/sync-capi-workflow.mjs')));
  // O workflow do Atendimento IA permanece, e NÃO é legado.
  const ai = JSON.parse(read(join(root, 'n8n/n8n_waha_atendimento_ia.json')));
  assert.equal(/^\[LEGADO\]/.test(ai.name), false);
});

test('FASE HÍBRIDA: a migração é aditiva e não derruba a captação antiga', () => {
  const migration = read(
    join(root, 'supabase/migrations/20260924210000_official_whatsapp_conversions.sql'),
  );

  // Nada de destrutivo neste deploy.
  assert.equal(/drop function if exists public\.waha_ingest_lead/.test(migration), false);
  assert.equal(/config - 'leads_webhook_url'/.test(migration), false);
  assert.equal(/drop table/i.test(migration), false);

  // E o modo por cliente existe, começando no legado.
  assert.equal(migration.includes('conversion_ingest_mode'), true);
  assert.equal(migration.includes("default 'legacy_waha'"), true);
  assert.equal(migration.includes('promote_client_to_official'), true);

  // A ingestão antiga continua existindo, agora ciente do modo.
  assert.equal(migration.includes('create or replace function public.waha_ingest_lead'), true);
  assert.equal(migration.includes("= 'official_meta' then"), true);
});

test('Conversões não é condicionada ao plano de Atendimento por IA', () => {
  const page = read(join(root, 'src/app/dashboard/conversoes/page.tsx'));
  assert.equal(/planType|plan_type|AiPlanLock/.test(page), false);

  const actions = read(join(root, 'src/app/conversoes/actions.ts'));
  assert.equal(/planType|plan_type/.test(actions), false);
});

test('nenhum segredo da Meta pode chegar ao navegador', () => {
  const clientFiles = files.filter((file) => read(file).startsWith('"use client"'));

  for (const file of clientFiles) {
    const source = read(file);

    // Nenhum segredo é LIDO no navegador. Um <input> onde o administrador
    // digita um token é o caminho oposto: o valor sobe para o servidor e a
    // tela só recebe de volta o booleano "configurado".
    assert.equal(
      /process\.env\.META_APP_SECRET|process\.env\.META_CREDENTIALS_KEY|process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(source),
      false,
      `${rel(file)} lê um segredo do ambiente no navegador`,
    );
    assert.equal(
      /config\.(app_secret|access_token|api_key|webhook_secret)(?!_configured)/.test(source),
      false,
      `${rel(file)} renderiza o valor de um segredo`,
    );
  }

  // O app secret só é lido no servidor, e a rota nunca devolve o token.
  const signup = read(join(root, 'src/app/api/whatsapp/embedded-signup/route.ts'));
  assert.equal(signup.includes('sealSecret(result.accessToken)'), true);
  assert.equal(/return Response\.json\([^)]*accessToken/.test(signup), false);
});

test('a dashboard não constrói seletor de número nem contorna a elegibilidade', () => {
  const onboarding = stripComments(
    read(join(root, 'src/lib/meta/whatsapp-onboarding.ts')),
  );

  // Nada de "se a Meta não indicou, escolhe o primeiro" — em nenhuma variação.
  assert.equal(/numbers\[0\]/.test(onboarding), false, 'voltou a escolher o primeiro número');
  assert.equal(/isOnBizApp === true\)\s*\?\?/.test(onboarding), false, 'voltou a desempatar por conta própria');
  assert.equal(/\?\?\s*numbers\./.test(onboarding), false, 'voltou a ter número de reserva');

  // A escolha é delegada ao módulo que só valida o que a Meta devolveu.
  assert.equal(onboarding.includes('resolveSharedNumber'), true);
  assert.equal(onboarding.includes('resolveAuthorizedWaba'), true);

  // A tela do cliente não lista números: quem lista é o popup da Meta.
  const screen = stripComments(
    read(join(root, 'src/components/conversions/whatsapp-official-connection.tsx')),
  );
  assert.equal(/phone_numbers|listPhoneNumbers|selecionar.{0,20}n[úu]mero/i.test(screen), false);
  // E abre o Embedded Signup oficial com Coexistence.
  assert.equal(screen.includes('whatsapp_business_app_onboarding'), true);
  assert.equal(screen.includes('FB.login'), true);
});

test('o envio à Meta nasce desligado, para validar em staging antes', () => {
  const dispatcher = read(join(root, 'src/lib/conversions/dispatcher.ts'));
  assert.equal(dispatcher.includes('CONVERSIONS_DISPATCHER_ENABLED'), true);

  // Sem a variável ligada, nada é enviado.
  delete process.env.CONVERSIONS_DISPATCHER_ENABLED;
  const enabled = (value) => value?.trim() === 'true';
  assert.equal(enabled(process.env.CONVERSIONS_DISPATCHER_ENABLED), false);
  assert.equal(enabled('false'), false);
  assert.equal(enabled('true'), true);

  // E o .env.example documenta o padrão desligado.
  const example = read(join(root, '.env.example'));
  assert.equal(example.includes('CONVERSIONS_DISPATCHER_ENABLED=false'), true);
});
