import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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

test('o fechamento conta o dia de hoje, com aviso de que ainda corre', () => {
  const closing = stripComments(
    readFileSync(new URL('../src/lib/data/closing.ts', import.meta.url), 'utf8'),
  );

  // O descarte do dia corrente era o que zerava o fechamento de uma campanha
  // que estreou hoje. O valor precisa valer para o instante em que é gerado.
  assert.equal(
    /filter\(\s*\(row\) => row\.date < currentDay/.test(closing),
    false,
    'o fechamento voltou a descartar o dia de hoje',
  );
  assert.match(closing, /includesToday/);

  // A dedupe continua: é ela que torna seguro somar o dia corrente caso a
  // janela algum dia passe a pedir também as linhas horárias.
  assert.match(closing, /dedupeMetricRowsByDay\(source\.metricRows\)/);

  // Tela e PDF precisam dizer que o dia ainda está em andamento.
  const page = readFileSync(
    new URL('../src/components/dashboard/closing-page.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(page.includes('data.includesToday'));

  const pdf = readFileSync(
    new URL('../src/components/pdf/closing-document.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(pdf.includes('data.includesToday'), 'o PDF de cobrança não avisa');
});

test('somar o dia de hoje não conta o mesmo gasto duas vezes', () => {
  // dashboard-metrics.ts usa o alias "@/", que o Node não resolve. A função é
  // isolada, então roda aqui a partir do próprio código-fonte — sem cópia, o
  // que manteria o teste verde mesmo se a regra real mudasse.
  const source = readFileSync(
    new URL('../src/lib/dashboard-metrics.ts', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('export function dedupeMetricRowsByDay');
  assert.ok(start > 0, 'dedupeMetricRowsByDay sumiu');

  const end = source.indexOf('\n}', start) + 2;
  const body = source
    .slice(start, end)
    .replace('export function', 'function')
    .replace(': RawCampaignMetric[]', '');

  const dedupeMetricRowsByDay = vm.runInNewContext(
    `${body}; dedupeMetricRowsByDay`,
    {},
  );

  // O sync grava o dia corrente nas duas granularidades. Se as duas entrassem
  // na soma, o fechamento cobraria quase o dobro.
  const hoje = '2026-09-29';
  const linhas = [
    { campaignId: 'c1', date: hoje, granularity: 'day', amountSpent: 36.23 },
    { campaignId: 'c1', date: hoje, granularity: 'hour', amountSpent: 20 },
    { campaignId: 'c1', date: hoje, granularity: 'hour', amountSpent: 16.23 },
    { campaignId: 'c1', date: '2026-09-28', granularity: 'day', amountSpent: 10 },
  ];

  const total = dedupeMetricRowsByDay(linhas).reduce(
    (soma, linha) => soma + linha.amountSpent,
    0,
  );

  assert.equal(Number(total.toFixed(2)), 46.23);
});

test('o fechamento diz por que está zerado', () => {
  const closing = stripComments(
    readFileSync(new URL('../src/lib/data/closing.ts', import.meta.url), 'utf8'),
  );

  for (const reason of ['filtro-sem-campanha', 'sem-metricas']) {
    assert.ok(closing.includes(reason), `falta o motivo ${reason}`);
  }

  const page = readFileSync(
    new URL('../src/components/dashboard/closing-page.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(page.includes('data.emptyReason'), 'a tela ignora o motivo');
});
