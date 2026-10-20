import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

// Exportação unificada de leads: formatação, CSV da Meta, planilha e RPCs
// de admin contra PostgreSQL real (PGlite).

const require = createRequire(import.meta.url);
function load(path, cache = new Map()) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const exports = {};
  cache.set(path, exports);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (spec) => {
    if (spec.startsWith('@/') || spec.startsWith('.')) {
      let target = spec.startsWith('@/') ? resolve('src', spec.slice(2)) : resolve(dirname(path), spec);
      if (!existsSync(target)) target += '.ts';
      return load(target, cache);
    }
    return require(spec);
  };
  const mod = { exports };
  new Function("exports", "require", "module", js)(exports, localRequire, mod);
  return mod.exports;
}

const format = load('src/lib/leads-export/format.ts');
const csv = load('src/lib/leads-export/meta-csv.ts');
const { buildLeadsWorkbook } = load('src/lib/leads-export/workbook.ts');

test('respostas do formulário: sem emoji, "_" vira espaço, primeira maiúscula', () => {
  assert.equal(format.cleanAnswer('🏦_banco_bv'), 'Banco BV');
  assert.equal(format.cleanAnswer('⏳_1_a_3_parcelas'), '1 a 3 parcelas');
  assert.equal(format.cleanAnswer('sim,_estou_pagando'), 'Sim, estou pagando');
  assert.equal(format.cleanAnswer('💰_r$_1.000_a_r$_2.000'), 'R$ 1.000 a r$ 2.000');
  assert.equal(format.cleanAnswer('✅_está_tudo_em_dia'), 'Está tudo em dia');
  assert.equal(format.cleanAnswer(''), '');
  assert.equal(format.cleanAnswer(null), '');
});

test('telefone sempre +55DDDNÚMERO; IDs sem prefixo', () => {
  assert.equal(format.formatPhone('p:+5511912345678'), '+5511912345678');
  assert.equal(format.formatPhone('11912345678'), '+5511912345678');
  assert.equal(format.formatPhone('(31) 99524-8845'), '+5531995248845');
  assert.equal(format.formatPhone('553195248845'), '+553195248845');
  assert.equal(format.formatPhone(''), '');
  assert.equal(format.stripMetaPrefix('l:1234567890'), '1234567890');
  assert.equal(format.stripMetaPrefix('ag:120211'), '120211');
});

test('campanha [dd-mm] do fim do nome, anúncio "Anuncio 07", data de Brasília', () => {
  assert.equal(format.campaignDate('1020 - Campanha [cadastro] - Soluções Verdes [12-08]'), '[12-08]');
  assert.equal(format.campaignDate('Campanha [1-8] e depois [3-9]'), '[03-09]');
  assert.equal(format.campaignDate('Campanha [cadastro]'), '');
  assert.equal(format.adLabel('7'), 'Anuncio 07');
  assert.equal(format.adLabel('Anuncio 7'), 'Anuncio 07');
  assert.equal(format.adLabel('Anúncio 12'), 'Anuncio 12');
  assert.equal(format.adLabel('Criativo carro azul'), 'Criativo carro azul');
  assert.equal(format.formatDateTimeBR('2026-08-12T17:31:00Z'), '12/08/2026 14:31');
  assert.equal(format.platformLabel('ig'), 'Instagram');
  assert.equal(format.platformLabel('fb'), 'Facebook');
});

const base = {
  client_name: 'Berg Auto Car', lead_name: null, phone: null, platform: null, bank: null,
  installment_value: null, overdue_installments: null, paid_installments: null,
  financing_status: null, priority: null, ad_id: null, ad_name: null, adset_name: null,
  campaign_name: null, form_name: null, ai_financed: null, ai_has_overdue: null, ai_overdue_count: null,
};

test('linhas: vazio quando não há dado, telefone repetido marcado, sem duplicar o mesmo lead', () => {
  const rows = format.buildExportRows([
    { ...base, origin: 'Atendimento IA', lead_id: 'ia-1', entered_at: '2026-10-20T15:00:00Z', phone: '5511912345678', bank: 'bv', ai_financed: true, ai_has_overdue: true, ai_overdue_count: 3 },
    { ...base, origin: 'Coexistência', lead_id: 'cx-1', entered_at: '2026-10-19T15:00:00Z', phone: '11912345678', ad_id: '120211', ad_name: '7', adset_name: 'Conjunto A', campaign_name: '1020 - Campanha - Berg [12-08]', platform: 'WhatsApp' },
    { ...base, origin: 'Coexistência', lead_id: 'cx-1', entered_at: '2026-10-19T15:00:00Z', phone: '11912345678' },
    { ...base, origin: 'WAHA (legado)', lead_id: 'w-1', entered_at: '2026-10-18T15:00:00Z', phone: '5531995248845' },
  ]);
  assert.equal(rows.length, 3);
  const [ia, cx, waha] = rows;
  assert.deepEqual(Object.keys(ia), format.LEADS_COLUMNS);
  assert.equal(ia.Banco, 'BV');
  assert.equal(ia['Parcelas em atraso'], '3 parcelas');
  assert.equal(ia['Situação do financiamento'], 'Está em atraso');
  assert.equal(ia['Valor da parcela'], '');
  assert.equal(ia.Campanha, '');
  assert.equal(ia['Telefone repetido?'], 'Sim');
  assert.equal(cx['Telefone repetido?'], 'Sim');
  assert.equal(cx.Anúncio, 'Anuncio 07');
  assert.equal(cx.Campanha, '[12-08]');
  assert.equal(cx['ID do anúncio'], '120211');
  assert.equal(waha['Telefone repetido?'], '');
  for (const row of rows) for (const value of Object.values(row))
    assert.ok(!/^(N\/A|null|undefined|-)$/i.test(value), `valor inventado: ${value}`);
});

function utf16(text) {
  const body = Buffer.from(text, 'utf16le');
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), body]));
}

test('CSV da Meta em UTF-16 com TAB: perguntas mapeadas e respostas limpas', () => {
  const header = [
    'id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name',
    'form_id', 'form_name', 'is_organic', 'platform', 'Priority',
    'qual_o_banco_do_seu_financiamento?', 'qual_o_valor_da_parcela?', 'tem_parcelas_em_atraso?',
    'quantas_parcelas_já_foram_pagas?', 'qual_a_situação_do_seu_financiamento?',
    'full_name', 'phone_number', 'lead_status',
  ];
  const line = [
    'l:1111111111', '2026-08-12T14:31:20-03:00', 'ag:120211', '7', 'as:9', 'Conjunto A', 'c:5',
    '1020 - Campanha [cadastro] - Soluções Verdes [12-08]', 'f:77', 'Form Quitação', 'false', 'ig', 'High Intent',
    '🏦_banco_bv', '💰_r$_1.000_a_r$_2.000', '⏳_1_a_3_parcelas', '📅_menos_de_12', '✅_sim,_estou_pagando',
    'Maria Souza', 'p:+5511912345678', 'CREATED',
  ];
  const second = [...line];
  second[0] = 'l:2222222222';
  second[11] = 'fb';
  second[1] = '';
  const parsed = csv.parseMetaLeadsCsv(utf16([header.join('\t'), line.join('\t'), second.join('\t')].join('\r\n')));
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rejected, [{ line: 3, reason: 'Data (created_time) inválida.' }]);
  const [row] = parsed.rows;
  assert.equal(row.meta_lead_id, '1111111111');
  assert.equal(row.ad_id, '120211');
  assert.equal(row.adset_id, '9');
  assert.equal(row.form_id, '77');
  assert.equal(row.platform, 'Instagram');
  assert.equal(row.priority, 'High Intent');
  assert.equal(row.phone, '+5511912345678');
  assert.equal(row.bank, 'Banco BV');
  assert.equal(row.installment_value, 'R$ 1.000 a r$ 2.000');
  assert.equal(row.overdue_installments, '1 a 3 parcelas');
  assert.equal(row.paid_installments, 'Menos de 12');
  assert.equal(row.financing_status, 'Sim, estou pagando');
  assert.equal(row.created_time, '2026-08-12T17:31:20.000Z');
  assert.equal(Object.keys(row.answers).length, 5);
});

test('planilha: cabeçalho #1F4E78 Arial branco, linha congelada, filtro e Resumo com COUNTIFS', async () => {
  const ExcelJS = require('exceljs');
  const rows = format.buildExportRows([
    { ...base, origin: 'Formulário Meta', lead_id: 'l:1', entered_at: '2026-10-20T15:00:00Z', campaign_name: 'X [12-08]', ad_name: '7' },
    { ...base, origin: 'Formulário Meta', lead_id: 'l:2', entered_at: '2026-10-19T15:00:00Z', campaign_name: 'X [12-08]', ad_name: '7' },
    { ...base, origin: 'Atendimento IA', lead_id: 'ia-1', entered_at: '2026-10-18T15:00:00Z' },
  ]);
  const buffer = await buildLeadsWorkbook(rows);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);

  const leads = book.getWorksheet('Leads');
  assert.deepEqual(leads.getRow(1).values.slice(1), format.LEADS_COLUMNS);
  const head = leads.getRow(1).getCell(1);
  assert.equal(head.font.bold, true);
  assert.equal(head.font.name, 'Arial');
  assert.equal(head.font.color.argb, 'FFFFFFFF');
  assert.equal(head.fill.fgColor.argb, 'FF1F4E78');
  assert.equal(leads.views[0].state, 'frozen');
  assert.equal(leads.views[0].ySplit, 1);
  assert.ok(leads.autoFilter);
  assert.equal(leads.rowCount, 4);
  // Lead da IA sem campanha: célula realmente vazia.
  assert.equal(leads.getRow(4).getCell(3).value, null);
  assert.ok(leads.getColumn(17).width >= 40);

  const summary = book.getWorksheet('Resumo');
  assert.deepEqual(summary.getRow(1).values.slice(1), ['Cliente', 'Origem', 'Campanha', 'Anúncio', 'Leads', '% do total']);
  const formulas = [];
  summary.eachRow((row, n) => { if (n > 1) formulas.push([row.getCell(1).value, row.getCell(5).value?.formula, row.getCell(6).value?.formula]); });
  assert.equal(formulas.length, 3);
  for (const [, count, pct] of formulas.slice(0, 2)) {
    assert.match(count, /^COUNTIFS\(Leads!\$A\$2:\$A\$4,A\d&"",Leads!\$B\$2:\$B\$4,B\d&"",/);
    assert.match(pct, /^IF\(\$E\$4=0,0,E\d\/\$E\$4\)$/);
  }
  const total = formulas.at(-1);
  assert.equal(total[0], 'Total');
  assert.equal(total[1], 'SUM(E2:E3)');
});

test('nome do arquivo segue o período', () => {
  assert.equal(format.exportFileName('2026-09-21', '2026-10-20'), 'Leads_Unificados_2026-09-21_a_2026-10-20.xlsx');
});

// ---------------------------------------------------------------------------
// RPCs no PostgreSQL real
// ---------------------------------------------------------------------------

const A = '10000000-0000-4000-8000-0000000000a1'; // quitação
const B = '10000000-0000-4000-8000-0000000000b2'; // compra de veículos
const C = '10000000-0000-4000-8000-0000000000c3'; // outro nicho
const ADMIN = '20000000-0000-4000-8000-000000000001';
const CLIENT_USER = '20000000-0000-4000-8000-000000000002';

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create table public.clients(id uuid primary key, nome_empresa text, segmento text);
    create table public.users(id uuid primary key default gen_random_uuid(), auth_user_id uuid, client_id uuid, role text, ativo boolean default true);
    create table public.conversion_leads(id uuid primary key default gen_random_uuid(), client_id uuid, telefone text, nome text,
      ad_source_id text, wa_message_id text, phone_number_id text, waha_event_id text, criado_em timestamptz default now());
    create table public.ai_conversations(id uuid primary key default gen_random_uuid(), client_id uuid, whatsapp_number text, name text,
      whatsapp_display_name text, bank text, financed boolean, has_overdue_installments boolean, overdue_installments_count integer, criado_em timestamptz default now());
    create table public.meta_ad_level_metrics(level text, external_id text, name text, adset_name text, campaign_name text, date date);
    grant usage on schema public, private, auth to authenticated, service_role, anon;
    insert into clients values ('${A}','Quita Já','veiculo_quitacao'),('${B}','Berg Auto Car','veiculo_atrasado'),('${C}','Loja Eventos','eventos');
    insert into users(auth_user_id, client_id, role) values ('${ADMIN}', null, 'admin'), ('${CLIENT_USER}', '${B}', 'client');
    insert into conversion_leads(client_id, telefone, nome, ad_source_id, wa_message_id, phone_number_id, criado_em) values
      ('${A}','5511900000001','Ana','120211','wamid.1','555','2026-10-10T12:00:00Z');
    insert into conversion_leads(client_id, telefone, nome, waha_event_id, criado_em) values
      ('${B}','5511900000002','Bia','waha-1','2026-10-11T12:00:00Z'),
      ('${C}','5511900000003','Caio','waha-2','2026-10-12T12:00:00Z');
    insert into ai_conversations(client_id, whatsapp_number, whatsapp_display_name, bank, financed, has_overdue_installments, criado_em) values
      ('${B}','5511900000004','Dani','bv',true,false,'2026-10-13T12:00:00Z'),
      ('${B}','5511900000005','Velho',null,null,null,'2026-01-01T12:00:00Z');
    insert into meta_ad_level_metrics values ('ad','120211','Anuncio 07','Conjunto A','1020 - Campanha [12-08]','2026-10-09'),
      ('ad','120211','Anuncio 07 (antigo)','Conjunto velho','x','2026-09-01');
  `);
  await db.exec(readFileSync('supabase/migrations/20261021120000_admin_unified_leads_export.sql', 'utf8'));
  return db;
}

const as = async (db, sub, role = 'authenticated') => {
  await db.exec(`reset role; set request.jwt.claims = '${JSON.stringify(sub ? { sub, role } : { role })}'; set role ${role};`);
};
const exportRows = (db, extra = '') =>
  db.query(`select * from public.admin_export_unified_leads('2026-10-01T00:00:00-03:00','2026-10-31T00:00:00-03:00'${extra})`);

test('RPCs só para admin; cliente e anônimo são recusados mesmo chamando direto', async () => {
  const db = await database();
  try {
    await as(db, CLIENT_USER);
    await assert.rejects(exportRows(db), /Apenas administradores/);
    await assert.rejects(
      db.query(`select public.admin_import_meta_form_leads('${B}', '[]'::jsonb)`),
      /Apenas administradores/,
    );
    // Cliente também não lê as tabelas novas diretamente.
    await assert.rejects(db.query('select * from public.meta_form_leads'));
    await as(db, null, 'anon');
    await assert.rejects(exportRows(db));
    // Admin inativo perde o acesso.
    await db.exec(`reset role; update users set ativo = false where auth_user_id = '${ADMIN}';`);
    await as(db, ADMIN);
    await assert.rejects(exportRows(db), /Apenas administradores/);
  } finally {
    await db.close();
  }
});

test('exportação: 4 origens, só os dois nichos, período, filtros, nomes do anúncio e somente leitura', async () => {
  const db = await database();
  try {
    await db.exec(`reset role;`);
    const before = (await db.query(`select (select count(*) from conversion_leads) + (select count(*) from ai_conversations) as n`)).rows[0].n;

    await as(db, ADMIN);
    const imported = (await db.query(
      `select public.admin_import_meta_form_leads($1, $2::jsonb) as r`,
      [A, JSON.stringify([
        { meta_lead_id: '1111', created_time: '2026-10-14T12:00:00Z', full_name: 'Eva', phone: '+5511900000001', platform: 'Instagram', bank: 'Banco BV', priority: 'High Intent', form_name: 'Form', answers: { Banco: 'Banco BV' } },
        { meta_lead_id: '1111', created_time: '2026-10-14T12:00:00Z', full_name: 'Eva dup' },
        { meta_lead_id: '2222', created_time: null },
      ])],
    )).rows[0].r;
    assert.deepEqual(imported, { received: 3, inserted: 1, skipped: 2 });
    // Reimportar o mesmo arquivo não duplica.
    const again = (await db.query(`select public.admin_import_meta_form_leads($1, $2::jsonb) as r`, [A, JSON.stringify([{ meta_lead_id: '1111', created_time: '2026-10-14T12:00:00Z' }])])).rows[0].r;
    assert.equal(again.inserted, 0);

    const rows = (await exportRows(db)).rows;
    assert.deepEqual(rows.map((r) => [r.origin, r.client_name]), [
      ['Formulário Meta', 'Quita Já'],
      ['Atendimento IA', 'Berg Auto Car'],
      ['WAHA (legado)', 'Berg Auto Car'],
      ['Coexistência', 'Quita Já'],
    ]);
    const coex = rows.find((r) => r.origin === 'Coexistência');
    // Nome do anúncio mais recente do cache de métricas.
    assert.equal(coex.ad_name, 'Anuncio 07');
    assert.equal(coex.adset_name, 'Conjunto A');
    assert.equal(coex.campaign_name, '1020 - Campanha [12-08]');
    assert.equal(rows.find((r) => r.origin === 'Atendimento IA').lead_name, 'Dani');
    // Cliente de outro nicho e lead fora do período não aparecem.
    assert.ok(!rows.some((r) => r.client_name === 'Loja Eventos' || r.lead_name === 'Velho'));

    const onlyB = (await exportRows(db, `, array['${B}']::uuid[]`)).rows;
    assert.ok(onlyB.every((r) => r.client_name === 'Berg Auto Car'));
    const onlyIa = (await exportRows(db, `, null, array['Atendimento IA']`)).rows;
    assert.deepEqual(onlyIa.map((r) => r.origin), ['Atendimento IA']);

    // Paginação estável: páginas de 1 juntam exatamente o mesmo resultado.
    const paged = [];
    for (let offset = 0; offset < 10; offset += 1) {
      const page = (await exportRows(db, `, null, null, 1, ${offset}`)).rows;
      if (!page.length) break;
      paged.push(...page);
    }
    assert.deepEqual(paged.map((r) => r.lead_id), rows.map((r) => r.lead_id));

    await db.exec(`reset role;`);
    const after = (await db.query(`select (select count(*) from conversion_leads) + (select count(*) from ai_conversations) as n`)).rows[0].n;
    assert.equal(after, before);
  } finally {
    await db.close();
  }
});
