import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildCreateTemplateBody,
  buildTemplateMessageBody,
  messagesEndpoint,
  normalizeRecipient,
  normalizeTemplateName,
  readMessageResult,
  readTemplateList,
  readTemplateResult,
  ReviewInputError,
  sanitizeMetaError,
  suggestTemplateName,
  templatesEndpoint,
} from '../src/lib/meta/review-validation.ts';

// Ferramenta TEMPORÁRIA de App Review. Os testes cuidam de duas coisas: que as
// chamadas batem nos endpoints oficiais com o payload certo, e que o token
// nunca escapa para lugar nenhum.

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(root, file), 'utf8');
// A dependência real está no código. Os comentários citam essas áreas
// justamente para dizer que a ferramenta não encosta nelas.
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const TOOL_FILES = [
  'src/lib/meta/review-validation.ts',
  'src/lib/meta/review-tools.ts',
  'src/app/admin/meta-review/page.tsx',
  'src/app/admin/meta-review/actions.ts',
  'src/components/admin/meta-review-tool.tsx',
];

// --------------------------------------------------------------------------
// Endpoints oficiais
// --------------------------------------------------------------------------

test('a mensagem vai para /{PHONE_NUMBER_ID}/messages', () => {
  assert.equal(
    messagesEndpoint('v23.0', '1254457314421149'),
    'https://graph.facebook.com/v23.0/1254457314421149/messages',
  );
});

test('o modelo vai para /{WABA_ID}/message_templates', () => {
  assert.equal(
    templatesEndpoint('v23.0', '1591864332471821'),
    'https://graph.facebook.com/v23.0/1591864332471821/message_templates',
  );
});

test('identificador inválido não vira URL', () => {
  for (const bad of ['', 'abc', '123', 'me/messages', '../../hack']) {
    assert.throws(() => messagesEndpoint('v23.0', bad), ReviewInputError);
    assert.throws(() => templatesEndpoint('v23.0', bad), ReviewInputError);
  }
});

// --------------------------------------------------------------------------
// Payloads
// --------------------------------------------------------------------------

test('o envio monta o corpo do template conforme a Cloud API', () => {
  const body = buildTemplateMessageBody({
    to: '+55 (14) 99999-0000',
    templateName: 'hello_world',
    language: 'en_US',
  });

  assert.deepEqual(body, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '5514999990000',
    type: 'template',
    template: { name: 'hello_world', language: { code: 'en_US' } },
  });
});

test('telefone inválido é recusado antes de sair da aplicação', () => {
  for (const bad of ['', '123', 'abcdefgh', '1'.repeat(16)]) {
    assert.throws(() => normalizeRecipient(bad), ReviewInputError);
  }

  // Formatação humana é aceita e normalizada.
  assert.equal(normalizeRecipient('+55 14 99999-0000'), '5514999990000');
});

test('nome de modelo segue as regras da Meta', () => {
  assert.equal(normalizeTemplateName(' meu_modelo_1 '), 'meu_modelo_1');

  for (const bad of ['Maiuscula', 'com-traco', 'com espaco', 'acentuação', '']) {
    assert.throws(() => normalizeTemplateName(bad), ReviewInputError);
  }

  // A sugestão automática precisa passar na própria regra.
  assert.equal(
    normalizeTemplateName(suggestTemplateName(new Date('2026-09-25T10:30:00Z'))),
    suggestTemplateName(new Date('2026-09-25T10:30:00Z')),
  );
});

test('a criação monta name/language/category/components', () => {
  const body = buildCreateTemplateBody({
    name: 'trafego_academy_review_1',
    language: 'pt_BR',
    category: 'utility',
    body: 'Esta é uma mensagem de teste da integração da Tráfego Academy.',
  });

  assert.deepEqual(body, {
    name: 'trafego_academy_review_1',
    language: 'pt_BR',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Esta é uma mensagem de teste da integração da Tráfego Academy.',
      },
    ],
  });
});

test('idioma e categoria inválidos são recusados', () => {
  const base = {
    name: 'ok_1',
    language: 'pt_BR',
    category: 'UTILITY',
    body: 'Mensagem de teste.',
  };

  assert.throws(() => buildCreateTemplateBody({ ...base, language: 'portugues' }), ReviewInputError);
  assert.throws(() => buildCreateTemplateBody({ ...base, category: 'PROMO' }), ReviewInputError);
  assert.throws(() => buildCreateTemplateBody({ ...base, body: 'abc' }), ReviewInputError);
});

// --------------------------------------------------------------------------
// Leitura das respostas
// --------------------------------------------------------------------------

test('o sucesso do envio captura o wamid', () => {
  const result = readMessageResult({
    messaging_product: 'whatsapp',
    contacts: [{ input: '5514999990000', wa_id: '5514999990000' }],
    messages: [{ id: 'wamid.HBgNNTUxNDk5OTk5MDAwMBUCABEYEjYxRjk=' }],
  });

  assert.match(result.messageId, /^wamid\./);
  assert.equal(result.waId, '5514999990000');
});

test('a criação captura id, status e category', () => {
  const result = readTemplateResult({
    id: '1234567890',
    status: 'PENDING',
    category: 'UTILITY',
  });

  assert.deepEqual(result, {
    id: '1234567890',
    status: 'PENDING',
    category: 'UTILITY',
  });
});

test('a lista devolve nome, idioma, status, categoria e id', () => {
  const rows = readTemplateList({
    data: [
      { id: '1', name: 'hello_world', language: 'en_US', status: 'APPROVED', category: 'UTILITY' },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'hello_world');
  assert.equal(readTemplateList(null).length, 0);
});

// --------------------------------------------------------------------------
// Segredo
// --------------------------------------------------------------------------

test('o erro da Meta é sanitizado e nunca carrega token', () => {
  const result = sanitizeMetaError({
    error: {
      message:
        'Invalid OAuth access token: Bearer EAAGm0PX4ZCpsBA1234567890abcdefghij failed for access_token=EAAsecret123456789012345',
      code: 190,
      error_subcode: 463,
    },
  });

  assert.equal(result.code, 190);
  assert.equal(result.subcode, 463);
  assert.equal(/EAA[A-Za-z0-9]{20,}/.test(result.message), false);
  assert.equal(result.message.includes('Bearer EAA'), false);
  assert.equal(result.message.includes('[removido]'), true);
});

test('erro sem detalhe não quebra e não vaza nada', () => {
  const result = sanitizeMetaError(null);
  assert.equal(result.code, null);
  assert.equal(typeof result.message, 'string');
});

test('o token só existe no servidor, no cabeçalho Authorization', () => {
  const tools = read('src/lib/meta/review-tools.ts');

  // Server-only e leitura da env apenas neste arquivo.
  assert.equal(tools.includes('import "server-only"'), true);
  assert.equal(tools.includes('Authorization: `Bearer ${token}`'), true);
  // Nunca em query string.
  assert.equal(/searchParams\.set\(\s*["']access_token["']/.test(tools), false);
  assert.equal(/access_token=/.test(tools), false);

  // A camada pura nunca vê o token.
  const validation = read('src/lib/meta/review-validation.ts');
  assert.equal(/META_REVIEW_ACCESS_TOKEN|accessToken/.test(validation), false);
});

test('nada do token atravessa para o navegador', () => {
  const ui = read('src/components/admin/meta-review-tool.tsx');
  const page = read('src/app/admin/meta-review/page.tsx');

  for (const source of [ui, page]) {
    assert.equal(source.includes('META_REVIEW_ACCESS_TOKEN'), false);
    assert.equal(source.includes('accessToken'), false);
    assert.equal(source.includes('Bearer'), false);
    assert.equal(/process\.env\./.test(source), false);
  }

  // A tela só recebe indicadores booleanos de configuração.
  assert.equal(ui.includes('hasAccessToken'), true);
  assert.equal(ui.includes('Configurado'), true);
});

test('a resposta devolvida à tela não carrega credencial', () => {
  const actions = read('src/app/admin/meta-review/actions.ts');

  // O que volta é sempre {ok, data} ou {ok, error, code} — nunca o payload cru.
  assert.equal(/return \{ ok: true, data: await/.test(actions), true);
  assert.equal(actions.includes('accessToken'), false);
  assert.equal(actions.includes('Bearer'), false);
});

test('os logs registram só ação, status, código e horário', () => {
  const tools = read('src/lib/meta/review-tools.ts');
  const logs = tools.match(/console\.(info|error|warn|log)\([\s\S]*?\);/g) ?? [];

  assert.ok(logs.length > 0);

  for (const line of logs) {
    assert.equal(/token|Authorization|Bearer|headers|body/i.test(line), false);
  }
});

// --------------------------------------------------------------------------
// Acesso
// --------------------------------------------------------------------------

test('a página exige administrador e as actions verificam de novo', () => {
  const page = read('src/app/admin/meta-review/page.tsx');

  // Sem sessão, getCurrentUser redireciona para o login.
  assert.equal(page.includes('getCurrentUser'), true);
  assert.equal(page.includes('user.role !== "admin"'), true);
  assert.equal(page.includes('redirect("/dashboard")'), true);

  const actions = read('src/app/admin/meta-review/actions.ts');

  // Server Action é endpoint HTTP: a tela não é a barreira.
  assert.equal(actions.includes('requireAdmin'), true);
  assert.equal(actions.includes('user.role !== "admin"'), true);

  const exported = actions.match(/export async function (\w+)/g) ?? [];
  assert.equal(exported.length, 3, 'toda action precisa ser verificada');

  for (const name of exported) {
    const fn = name.replace('export async function ', '');
    const bodyStart = actions.indexOf(`export async function ${fn}`);
    const body = actions.slice(bodyStart, bodyStart + 600);
    assert.equal(body.includes('requireAdmin()'), true, `${fn} sem verificação`);
  }
});

test('ação real na Meta tem proteção contra clique repetido', () => {
  const actions = read('src/app/admin/meta-review/actions.ts');
  assert.equal(actions.includes('rateLimited'), true);

  const ui = read('src/components/admin/meta-review-tool.tsx');
  // Botões desabilitados durante a requisição.
  assert.equal(ui.includes('disabled={disabled'), true);
  // Criação de modelo pede confirmação.
  assert.equal(ui.includes('window.confirm'), true);
});

test('configuração ausente não derruba a página', () => {
  const tools = read('src/lib/meta/review-tools.ts');

  // O status é calculado sem lançar; só a execução exige a configuração.
  assert.equal(tools.includes('export function getReviewConfigStatus'), true);
  assert.match(tools, /missing\.push\("META_REVIEW_PHONE_NUMBER_ID"\)/);

  const ui = read('src/components/admin/meta-review-tool.tsx');
  assert.equal(ui.includes('Configuração do Meta App Review incompleta'), true);
  // E a tela mostra só o NOME do que falta.
  assert.equal(ui.includes('config.missing.join'), true);
});

// --------------------------------------------------------------------------
// Isolamento
// --------------------------------------------------------------------------

test('a ferramenta usa a MESMA versão da Graph do resto do projeto', () => {
  const tools = read('src/lib/meta/review-tools.ts');

  // Reutiliza o helper do projeto em vez de manter uma versão própria.
  assert.equal(
    tools.includes('from "@/lib/meta/conversions-config"'),
    true,
    'deveria importar getMetaGraphVersion do projeto',
  );
  assert.equal(tools.includes('getMetaGraphVersion()'), true);

  // Nenhum padrão de versão duplicado nem leitura própria da env.
  assert.equal(/DEFAULT_GRAPH_VERSION|getReviewGraphVersion/.test(tools), false);
  assert.equal(/process\.env\.META_GRAPH_VERSION/.test(tools), false);
  assert.equal(/v\d+\.\d+/.test(stripComments(tools)), false, 'versão fixa no código');
});

test('a ferramenta não encosta em Conversões, WAHA, n8n ou IA', () => {
  for (const file of TOOL_FILES) {
    assert.ok(existsSync(join(root, file)), `${file} deveria existir`);

    // A versão da Graph é a única coisa compartilhada, e é só configuração.
    const source = stripComments(read(file)).replaceAll(
      'conversions-config',
      'shared-config',
    );
    const forbidden =
      /conversion_events|conversion_leads|client_whatsapp_connections|dispatcher|capi-payload|conversion_ingest_mode|conversion_goal_type|embedded-signup|waha|n8n|ai-agent/i;

    assert.equal(
      forbidden.test(source),
      false,
      `${file} referencia área que deveria ficar intocada`,
    );
  }
});

test('nenhum arquivo fora da ferramenta foi alterado para suportá-la', () => {
  // A ferramenta é aditiva: nada em src/ importa dela, exceto ela mesma.
  function walk(dir) {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  }

  const importers = walk(join(root, 'src'))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => /review-tools|review-validation|meta-review/.test(readFileSync(file, 'utf8')))
    .map((file) => file.replace(root, '').replace(/\\/g, '/'));

  for (const file of importers) {
    assert.ok(
      TOOL_FILES.includes(file),
      `${file} passou a depender da ferramenta temporária`,
    );
  }
});

test('nenhum token aparece em código, em nenhum arquivo da ferramenta', () => {
  for (const file of TOOL_FILES) {
    const source = read(file);
    // Token da Meta começa com EAA e é longo. Nada parecido pode estar fixo.
    assert.equal(/\bEAA[A-Za-z0-9]{20,}/.test(source), false, `${file}`);
  }
});
