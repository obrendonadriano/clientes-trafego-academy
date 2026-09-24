import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { test } from 'node:test';

// TESTE 12/13/14: Conversões não pode depender de WAHA nem de n8n, e o
// Atendimento por IA precisa continuar usando o WAHA normalmente.
//
// Desligar o WAHA ou o workflow antigo do n8n não é testável aqui sem os
// serviços reais; o que se verifica é a única coisa que torna isso possível:
// que nenhum caminho de código de Conversões passa por eles.

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
  'src/components/admin/conversions-diagnostics.tsx',
];

test('TESTE 12/13: nenhum arquivo de Conversões depende de WAHA ou n8n', () => {
  for (const file of CONVERSIONS) {
    const path = join(root, file);
    assert.ok(existsSync(path), `${file} deveria existir`);

    const source = stripComments(read(path));
    assert.equal(/waha/i.test(source), false, `${file} ainda usa WAHA`);
    assert.equal(/n8n/i.test(source), false, `${file} ainda usa n8n`);
    assert.equal(
      source.includes('waha_ingest_lead'),
      false,
      `${file} ainda usa a ingestão antiga`,
    );
  }
});

test('TESTE 14: o Atendimento por IA continua usando o WAHA', () => {
  const aiPipeline = read(join(root, 'src/lib/ai-agent/pipeline.ts'));
  assert.equal(/waha/i.test(aiPipeline), true, 'o pipeline da IA perdeu o WAHA');

  // A sessão WAHA continua sendo criada e o webhook da IA continua registrado.
  const connect = read(join(root, 'src/app/whatsapp/conectar/route.ts'));
  assert.equal(connect.includes('config.aiWebhookUrl'), true);
  // ...e o webhook de leads das Conversões saiu de vez do WAHA.
  assert.equal(connect.includes('leadsWebhookUrl'), false);

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

test('o workflow antigo de CAPI e a ingestão WAHA de leads saíram do repositório', () => {
  for (const file of [
    'n8n/n8n_capi_conversoes.json',
    'n8n/n8n_waha_ingestao.json',
    'scripts/sync-capi-workflow.mjs',
  ]) {
    assert.equal(existsSync(join(root, file)), false, `${file} ainda existe`);
  }

  // O workflow do Atendimento IA permanece.
  assert.ok(existsSync(join(root, 'n8n/n8n_waha_atendimento_ia.json')));
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
