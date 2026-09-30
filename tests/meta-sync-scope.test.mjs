import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Regressão de perda de dados.
//
// `removeStaleMetricRows` apaga, na janela de 30 dias, toda linha de métrica
// que não veio no retrato atual. O escopo dessa exclusão é o que decide se ela
// limpa o que sobrou ou se destrói o histórico de outras contas de anúncio.

const sync = readFileSync(
  new URL('../src/lib/sync/meta-sync.ts', import.meta.url),
  'utf8',
);
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(sync);

test('a limpeza alcança só as campanhas que a própria conta importou', () => {
  // O bug: passar todas as campanhas mapeadas. Quando a conta vem da
  // configuração antiga (account.id nulo) o mapeamento é a tabela inteira, e
  // sincronizar uma conta apagava os últimos 30 dias das outras.
  assert.equal(
    /campaignIds:\s*\(campaigns as CampaignLookupRow\[\]\)/.test(code),
    false,
    'a exclusão voltou a receber todas as campanhas mapeadas',
  );

  assert.match(code, /campaignIds:\s*importedCampaignIds/);
  assert.match(
    code,
    /importedCampaignIds\s*=\s*\[\s*\.\.\.new Set\(uniqueRows\.map\(\(row\) => row\.campaign_id\)\)/,
  );
});

test('a exclusão continua guardada por lista vazia', () => {
  // Sem esta guarda, um import que não trouxe nada apagaria a janela inteira.
  assert.match(code, /if \(!adminClient \|\| input\.campaignIds\.length === 0\) \{\s*return;/);
});

test('o retrato novo é gravado antes de qualquer exclusão', () => {
  const upsertAt = code.indexOf('await upsertMetricRows(uniqueRows)');
  const removeAt = code.indexOf('await removeStaleMetricRows(');

  assert.ok(upsertAt > 0 && removeAt > 0);
  assert.ok(
    upsertAt < removeAt,
    'gravar depois de apagar deixaria a janela vazia se o upsert falhasse',
  );
});

test('insights de conjunto/anúncio descartados não passam em silêncio', () => {
  // Antes, um vínculo errado entre campanha e conta fazia todos os insights
  // serem ignorados e a tela ficava vazia sem erro em lugar nenhum.
  assert.match(code, /skipped\.unmappedCampaign \+= 1/);
  assert.match(code, /received > 0 && rows\.length === 0/);
  assert.match(code, /throw new Error\(/);
});

test('a tela de conjuntos/anúncios explica a lista vazia', () => {
  const adLevels = stripComments(
    readFileSync(new URL('../src/lib/data/ad-levels.ts', import.meta.url), 'utf8'),
  );

  // `every` devolve true para lista vazia: sem esta saída antecipada, zero
  // linhas resultava em tabela vazia e nenhum aviso.
  const emptyGuard = adLevels.indexOf('summaryRows.length === 0');
  const everyCall = adLevels.indexOf('summaryRows.every(');

  assert.ok(emptyGuard > 0, 'falta a saída para nenhuma linha');
  assert.ok(
    emptyGuard < everyCall,
    'a checagem de lista vazia precisa vir antes do every',
  );
});

test('as rotas antigas de conjunto/anúncio não deixam a URL trocar o nível', () => {
  // `nivel` era definido antes de copiar os parâmetros, então um `nivel` na URL
  // sobrescrevia o da rota e a aba abria no nível errado.
  for (const [file, level] of [
    ['src/app/admin/campanhas/conjuntos/page.tsx', 'adset'],
    ['src/app/admin/campanhas/anuncios/page.tsx', 'ad'],
    ['src/app/dashboard/campanhas/conjuntos/page.tsx', 'adset'],
    ['src/app/dashboard/campanhas/anuncios/page.tsx', 'ad'],
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const setAt = source.indexOf(`params.set("nivel", "${level}")`);
    const copyAt = source.indexOf('for (const [key, value]');

    assert.ok(setAt > 0, `${file} não fixa o nível`);
    assert.ok(copyAt > 0, `${file} não copia os parâmetros`);
    assert.ok(setAt > copyAt, `${file}: o nível precisa ser definido depois da cópia`);
  }
});

test('o fechamento diz por que está zerado', () => {
  const closing = stripComments(
    readFileSync(new URL('../src/lib/data/closing.ts', import.meta.url), 'utf8'),
  );

  for (const reason of [
    'somente-hoje',
    'so-comecou-hoje',
    'filtro-sem-campanha',
    'sem-metricas',
  ]) {
    assert.ok(closing.includes(reason), `falta o motivo ${reason}`);
  }

  // Período que cobre apenas hoje nunca tem valor: o fechamento só conta dias
  // encerrados, e no dia 1º o atalho "Este mês" cai exatamente nisso.
  assert.match(closing, /coversOnlyToday\s*=\s*window\.startDate >= currentDay/);

  const page = readFileSync(
    new URL('../src/components/dashboard/closing-page.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(page.includes('data.emptyReason'), 'a tela ignora o motivo');
});
