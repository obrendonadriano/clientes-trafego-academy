import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Executa o SQL real das migrações num PostgreSQL de verdade (PGlite).
// Cobre o funil de três etapas, a idempotência do webhook oficial, o
// isolamento entre clientes e a recuperação de entrega.

const clientA = '10000000-0000-4000-8000-000000000001';
const clientB = '10000000-0000-4000-8000-000000000002';
const actor = '20000000-0000-4000-8000-000000000001';

const read = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const outbox = read('20260924020710_conversion_event_outbox.sql');
const official = read('20260924210000_official_whatsapp_conversions.sql');
const previous = read('20260826181403_closed_lead_meta_pipeline.sql');
const guard = previous.slice(
  previous.indexOf('create or replace function private.guard_conversion_lead_update()'),
  previous.indexOf('grant update (valor, moeda)'),
);

let clickCounter = 0;

test('Conversões oficiais: funil, idempotência, isolamento e entrega', async (t) => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create function private.is_active_admin() returns boolean language sql stable as $$ select false $$;
    create function public.is_app_admin() returns boolean language sql stable as $$ select false $$;
    create type public.app_role as enum ('admin','client');
    create type public.lead_qualification as enum ('pendente','qualificado','desqualificado','fechado');
    create type public.capi_send_status as enum ('nao_enviado','enviado','erro','ignorado');
    create table public.clients(id uuid primary key, meta_dataset_id text, meta_waba_id text, capi_ativo boolean default false, nome_empresa text default 'Test');
    create table public.users(id uuid primary key, auth_user_id uuid, client_id uuid, role public.app_role default 'client', ativo boolean default true);
    create table public.integration_settings(id uuid primary key default gen_random_uuid(), provider text, enabled boolean default false, config jsonb default '{}'::jsonb, updated_at timestamptz default now());
    create table private.client_capi_credentials(client_id uuid primary key, access_token text, atualizado_em timestamptz default now());
    create table public.whatsapp_sessions(client_id uuid primary key, session_name text unique, status text);
    create table public.conversion_leads(
      id uuid primary key default gen_random_uuid(), client_id uuid references clients(id), campaign_id uuid,
      telefone text, email text, nome text, ctwa_clid text, ad_source_id text, ad_entry_point text,
      qualificacao public.lead_qualification default 'pendente', observacao text, valor numeric, moeda text default 'BRL',
      capi_event_name text default 'LeadSubmitted', capi_status public.capi_send_status default 'nao_enviado',
      capi_event_id text, capi_enviado_em timestamptz, capi_resposta text, capi_tentativas integer default 0,
      capi_claimed_at timestamptz, capi_next_attempt_at timestamptz, waha_event_id text,
      qualificado_por uuid, qualificado_em timestamptz, criado_em timestamptz default now(), atualizado_em timestamptz default now()
    );
    create function public.capi_fetch_queue(integer) returns void language sql as $$ select; $$;
    create function public.capi_mark_result(uuid,text,boolean,text) returns void language sql as $$ select; $$;
    ${guard}
    create trigger conversion_leads_guard_update before update on public.conversion_leads for each row execute function private.guard_conversion_lead_update();
    alter table public.conversion_leads enable row level security;
    create policy tenant on public.conversion_leads to authenticated
      using(client_id = (select client_id from public.users where auth_user_id = auth.uid()))
      with check(client_id = (select client_id from public.users where auth_user_id = auth.uid()));
    grant usage on schema public,private,auth to authenticated,service_role;
    grant select on public.conversion_leads,public.users to authenticated;
    grant update(qualificacao,observacao,valor,moeda) on public.conversion_leads to authenticated;
    grant all on public.conversion_leads to service_role;
    -- Grants que a migração 20260824190000 já concede no banco real.
    grant all on public.clients, public.whatsapp_sessions, public.integration_settings to service_role;
    grant select on public.clients to authenticated;
    insert into clients(id,meta_dataset_id,meta_waba_id,capi_ativo) values ('${clientA}','dataset-a','waba-a',true),('${clientB}','dataset-b','waba-b',true);
    insert into public.users values ('${actor}','${actor}','${clientA}');
    insert into public.whatsapp_sessions values ('${clientA}','sess-a','WORKING'),('${clientB}','sess-b','WORKING');
    insert into private.client_capi_credentials(client_id,access_token) values ('${clientA}','test-only-token'),('${clientB}','test-only-token');
    -- Histórico anterior à migração. Sem estas linhas o backfill de \`origem\`
    -- atualiza zero registros e o gatilho de escrita nunca é exercitado — foi
    -- assim que a migração passou nos testes e falhou no banco real.
    insert into conversion_leads(client_id,telefone,ctwa_clid,qualificacao)
      values ('${clientA}','5511970000001','legado-com-clique','pendente'),
             ('${clientA}','5511970000002',null,'pendente'),
             ('${clientA}','5511970000003',null,'desqualificado');
  `);
  // Como no editor SQL do Supabase: sem JWT e sem auth.uid().
  await db.exec(`reset role; reset request.jwt.claims;`);
  await db.exec(outbox);
  await db.exec(official);

  const sql = async (query, params = []) => (await db.query(query, params)).rows;
  async function service() {
    await db.exec(`reset role; set request.jwt.claims = '{"role":"service_role"}'; set role service_role;`);
  }
  async function user() {
    await db.exec(`reset role; set request.jwt.claims = '{"role":"authenticated","sub":"${actor}"}'; set role authenticated;`);
  }
  async function lead({ click = undefined, tenant = clientA, days = 0, phone = '+55 (11) 99999-0001' } = {}) {
    await service();
    const id = click === null ? null : (click ?? `click-${++clickCounter}`);
    return (await sql(
      `insert into conversion_leads(client_id,telefone,ctwa_clid,origem,criado_em) values($1,$2,$3,$4,now()-$5::integer * interval '1 day') returning id`,
      [tenant, phone, id, id ? 'anuncio' : 'organico', days],
    ))[0].id;
  }
  async function move(id, stage) {
    await user();
    await sql(`update conversion_leads set qualificacao=$2::public.lead_qualification where id=$1`, [id, stage]);
    await service();
  }
  async function events(id) { return sql('select * from private.conversion_events where lead_id=$1 order by event_name', [id]); }
  async function queue() { await service(); return sql('select * from capi_fetch_queue(50)'); }
  async function ack(event, ok = true, retryable = false) {
    await service();
    await sql('select capi_mark_result($1,$2,$3,$4,$5)', [event.lead_id, event.event_id, ok, 'test', retryable]);
  }
  async function connect(tenant, { waba, phoneId, dataset }) {
    await service();
    await sql('select meta_save_whatsapp_connection($1,$2,$3,null,null,null,$4,true,$5,true,$6,$7,null,null)',
      [tenant, waba, phoneId, dataset, 'CLOUD_API', 'active', 'sealed-token']);
  }
  async function wahaIngest(overrides = {}) {
    await service();
    const input = {
      session: 'sess-a', phone: '5511970001111', name: 'Legado',
      click: null, adId: null, entry: 'ad', eventId: `waha-${++clickCounter}`, ...overrides,
    };
    return sql('select * from waha_ingest_lead($1,$2,$3,$4,$5,$6,$7)',
      [input.session, input.phone, input.name, input.click, input.adId, input.entry, input.eventId]);
  }
  async function mode(tenant) {
    await service();
    return (await sql('select conversion_ingest_mode from clients where id=$1', [tenant]))[0].conversion_ingest_mode;
  }
  async function ingest(overrides = {}) {
    await service();
    const input = {
      phoneId: '5550001', waba: '7770001', messageId: `wamid-${++clickCounter}`,
      phone: '5511988887777', click: `click-${clickCounter}`, name: 'Fulano',
      adId: '900900', url: 'https://fb.me/ad', type: 'ad', at: null, ...overrides,
    };
    return sql('select * from meta_ingest_ad_lead($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [input.phoneId, input.waba, input.messageId, input.phone, input.click,
       input.name, input.adId, input.url, input.type, input.at]);
  }

  await t.test('TESTE 3/5/6/7: novo → qualificado → comprado gera os três marcos, sem custo no payload', async () => {
    const id = await lead();
    await move(id, 'qualificado');
    await move(id, 'fechado');
    assert.deepEqual((await events(id)).map((e) => e.event_name), ['LeadSubmitted', 'QualifiedLead', 'VehicleAcquired']);

    const rows = (await queue()).filter((e) => e.lead_id === id);
    assert.equal(rows.length, 3);

    const acquired = rows.find((e) => e.event_name === 'VehicleAcquired');
    assert.equal(acquired.action_source, 'other');
    assert.deepEqual(acquired.user_data, { ph: [createHash('sha256').update('5511999990001').digest('hex')] });
    // O valor pago nunca vai junto: não é receita.
    assert.equal(acquired.valor, null);
    assert.equal(rows.find((e) => e.event_name === 'QualifiedLead').user_data.whatsapp_business_account_id, 'waba-a');
  });

  await t.test('TESTE 9: voltar e avançar não reenvia um marco já confirmado', async () => {
    const id = await lead();
    await move(id, 'qualificado');
    const qualified = (await queue()).find((e) => e.lead_id === id && e.event_name === 'QualifiedLead');
    await ack(qualified);

    await move(id, 'pendente');
    await move(id, 'qualificado');
    await move(id, 'pendente');
    await move(id, 'qualificado');

    const all = await events(id);
    assert.equal(all.filter((e) => e.event_name === 'QualifiedLead').length, 1);
    assert.equal(all.find((e) => e.event_name === 'QualifiedLead').status, 'enviado');
    assert.equal((await queue()).some((e) => e.lead_id === id && e.event_name === 'QualifiedLead'), false);
  });

  await t.test('a etapa Desqualificado saiu do funil sem apagar o histórico', async () => {
    await user();
    const id = await lead();
    await user();
    await assert.rejects(
      sql(`update conversion_leads set qualificacao='desqualificado' where id=$1`, [id]),
      /Desqualificado foi removida/,
    );

    // Uma linha histórica continua existindo e pode sair da etapa removida.
    await service();
    const legacy = await lead();
    await sql(`update conversion_leads set qualificacao='desqualificado' where id=$1`, [legacy]);
    assert.equal((await sql('select qualificacao from conversion_leads where id=$1', [legacy]))[0].qualificacao, 'desqualificado');
    await move(legacy, 'qualificado');
    assert.equal((await sql('select qualificacao from conversion_leads where id=$1', [legacy]))[0].qualificacao, 'qualificado');
  });

  await t.test('mover para comprado não exige informar o valor pago', async () => {
    const id = await lead();
    await move(id, 'fechado');
    const row = (await sql('select qualificacao, valor from conversion_leads where id=$1', [id]))[0];
    assert.equal(row.qualificacao, 'fechado');
    assert.equal(row.valor, null);
    assert.equal((await events(id)).some((e) => e.event_name === 'VehicleAcquired'), true);
  });

  await t.test('o valor pago pode ser registrado depois, e nunca vira receita', async () => {
    const id = await lead();
    await move(id, 'fechado');

    // O cliente registra o custo de aquisição num segundo momento.
    await user();
    await sql(`update conversion_leads set valor=25000, moeda='BRL' where id=$1`, [id]);
    await service();
    assert.equal(Number((await sql('select valor from conversion_leads where id=$1', [id]))[0].valor), 25000);

    // O evento continua sem valor: a fila nunca carrega custo de aquisição.
    const acquired = (await queue()).find((e) => e.lead_id === id && e.event_name === 'VehicleAcquired');
    assert.equal(acquired.valor, null);
    assert.equal(acquired.moeda, null);
    assert.equal(JSON.stringify(acquired.user_data).includes('25000'), false);

    // Fora de "comprado", alterar o valor continua proibido.
    const other = await lead();
    await user();
    await assert.rejects(
      sql(`update conversion_leads set valor=999 where id=$1`, [other]),
      /Apenas qualificação/,
    );
    await service();
  });

  await t.test('cancelar uma qualificação não enviada preserva o horário original', async () => {
    const id = await lead();
    await move(id, 'qualificado');
    const first = (await events(id)).find((e) => e.event_name === 'QualifiedLead');
    await move(id, 'pendente');
    assert.equal((await events(id)).find((e) => e.event_name === 'QualifiedLead').status, 'ignorado');
    await move(id, 'qualificado');
    const restored = (await events(id)).find((e) => e.event_name === 'QualifiedLead');
    assert.equal(restored.event_time.getTime(), first.event_time.getTime());
    assert.equal(restored.event_id, first.event_id);
  });

  await t.test('sem identificador de clique não há evento de mensagens, mas a aquisição usa telefone', async () => {
    const id = await lead({ click: null });
    await move(id, 'qualificado');
    await move(id, 'fechado');
    assert.deepEqual((await events(id)).map((e) => e.status), ['ignorado', 'ignorado', 'nao_enviado']);
    assert.deepEqual((await queue()).filter((e) => e.lead_id === id).map((e) => e.event_name), ['VehicleAcquired']);
  });

  await t.test('datas vencidas e entrega desconhecida nunca são reescritas nem reenviadas sozinhas', async () => {
    const old = await lead({ days: 8 });
    const time = (await events(old))[0].event_time;
    assert.equal((await queue()).some((e) => e.lead_id === old), false);
    assert.equal((await events(old))[0].event_time.getTime(), time.getTime());
    assert.equal((await events(old))[0].status, 'erro');

    const id = await lead();
    const event = (await queue()).find((e) => e.lead_id === id);
    assert.equal((await queue()).some((e) => e.lead_id === id), false);
    await ack(event, false);
    assert.equal((await events(id))[0].attempts, 5);
    assert.equal((await queue()).some((e) => e.lead_id === id), false);
  });

  await t.test('rejeição temporária explícita tem espera crescente; confirmar duas vezes não regride', async () => {
    const id = await lead();
    const event = (await queue()).find((e) => e.lead_id === id);
    await ack(event, false, true);
    assert.equal((await queue()).some((e) => e.lead_id === id), false);
    await sql(`update private.conversion_events set next_attempt_at=now()-interval '1 second' where event_id=$1`, [event.event_id]);
    const retry = (await queue()).find((e) => e.lead_id === id);
    assert.equal(retry.event_id, event.event_id);
    assert.equal(retry.event_time, event.event_time);
    await ack(retry);
    await ack(retry, false);
    assert.equal((await events(id))[0].status, 'enviado');
  });

  await t.test('TESTE 11: RLS e permissões isolam clientes e protegem segredos', async () => {
    const other = await lead({ tenant: clientB });
    await user();
    assert.equal((await sql('select id from conversion_leads where id=$1', [other])).length, 0);
    assert.equal((await sql(`update conversion_leads set qualificacao='qualificado' where id=$1 returning id`, [other])).length, 0);
    await assert.rejects(sql('select * from capi_fetch_queue(1)'), /permission denied/);
    await assert.rejects(sql('select * from private.conversion_events'), /permission denied/);
    await assert.rejects(sql('select * from private.client_whatsapp_credentials'), /permission denied/);
    await assert.rejects(sql(`update conversion_leads set ctwa_clid='forged'`), /permission denied/);
    // Nenhuma RPC de onboarding é executável por um usuário do portal.
    await assert.rejects(sql(`select meta_ingest_ad_lead('1','2','3','5511999999999','x')`), /permission denied|Acesso negado/);
    await assert.rejects(sql(`select meta_disconnect_whatsapp('${clientA}')`), /permission denied|Acesso negado/);
    await service();
    assert.equal((await events(other)).length, 1);
  });

  await t.test('TESTE B/D/E: conectar resolve o Dataset e reconectar não duplica nada', async () => {
    await connect(clientA, { waba: '7770001', phoneId: '5550001', dataset: '880001' });
    const first = (await sql('select * from client_whatsapp_connections where client_id=$1', [clientA]))[0];
    assert.equal(first.dataset_id, '880001');
    assert.equal(first.status, 'active');
    assert.equal(first.is_on_biz_app, true);

    // Desconectar e reconectar reaproveita o Dataset; nunca cria um segundo.
    await sql('select meta_disconnect_whatsapp($1)', [clientA]);
    assert.equal((await sql('select status from client_whatsapp_connections where client_id=$1', [clientA]))[0].status, 'disconnected');
    assert.equal((await sql('select count(*)::int as n from private.client_whatsapp_credentials where client_id=$1', [clientA]))[0].n, 0);

    await connect(clientA, { waba: '7770001', phoneId: '5550001', dataset: null });
    const again = (await sql('select * from client_whatsapp_connections where client_id=$1', [clientA]))[0];
    assert.equal(again.dataset_id, '880001');
    assert.equal(again.connected_at.getTime(), first.connected_at.getTime());
    assert.equal((await sql('select count(*)::int as n from client_whatsapp_connections')).length, 1);
  });

  await t.test('TESTE C: um WABA, um número e um Dataset pertencem a um único cliente', async () => {
    await connect(clientB, { waba: '7770002', phoneId: '5550002', dataset: '880002' });
    // Nenhum cliente pode assumir o WhatsApp ou o Dataset de outro.
    await assert.rejects(connect(clientB, { waba: '7770001', phoneId: '5550009', dataset: '880009' }), /já está conectado a outro cliente/);
    await assert.rejects(connect(clientB, { waba: '7770009', phoneId: '5550001', dataset: '880009' }), /já está conectado a outro cliente/);
    await assert.rejects(connect(clientB, { waba: '7770009', phoneId: '5550009', dataset: '880001' }), /já está conectado a outro cliente/);

    const datasets = await sql('select dataset_id from client_whatsapp_connections order by dataset_id');
    assert.deepEqual(datasets.map((r) => r.dataset_id), ['880001', '880002']);
  });

  await t.test('TESTE 4/F: o lead do anúncio é do dono do número, com o ctwa_clid guardado', async () => {
    const [row] = await ingest({ phoneId: '5550001', waba: '7770001', click: 'clid-tenant', messageId: 'wamid-tenant' });
    assert.equal(row.novo, true);
    // O tenant sai do número cadastrado, jamais de um client_id do payload.
    assert.equal(row.client_id, clientA);

    const lead = (await sql('select * from conversion_leads where id=$1', [row.lead_id]))[0];
    assert.equal(lead.ctwa_clid, 'clid-tenant');
    assert.equal(lead.ad_source_id, '900900');
    assert.equal(lead.origem, 'anuncio');
    assert.equal(lead.telefone, '5511988887777');
    assert.equal(lead.waba_id, '7770001');

    // LeadSubmitted entra na fila automaticamente, sem ação do cliente.
    assert.equal((await events(row.lead_id)).find((e) => e.event_name === 'LeadSubmitted').status, 'nao_enviado');

    // Um número desconhecido não vira lead de ninguém.
    const [unknown] = await ingest({ phoneId: '5559999', waba: '7779999', click: 'clid-orfao' });
    assert.equal(unknown, undefined);
  });

  await t.test('TESTE 8: repetir o webhook não duplica lead nem apaga o vínculo do anúncio', async () => {
    const [first] = await ingest({ phoneId: '5550001', waba: '7770001', click: 'clid-dedup', messageId: 'wamid-dedup' });
    const [again] = await ingest({ phoneId: '5550001', waba: '7770001', click: 'clid-dedup', messageId: 'wamid-dedup' });
    assert.equal(again.novo, false);
    assert.equal(again.lead_id, first.lead_id);

    // Uma segunda mensagem do mesmo clique, com outro message id, também não
    // cria um lead novo — e não sobrescreve o identificador original.
    const [third] = await ingest({ phoneId: '5550001', waba: '7770001', click: 'clid-dedup', messageId: 'wamid-outro', adId: '111' });
    assert.equal(third.novo, false);
    assert.equal(third.lead_id, first.lead_id);

    const lead = (await sql('select * from conversion_leads where id=$1', [first.lead_id]))[0];
    assert.equal(lead.ctwa_clid, 'clid-dedup');
    assert.equal(lead.ad_source_id, '900900');
    assert.equal(lead.wa_message_id, 'wamid-dedup');
    assert.equal((await events(first.lead_id)).length, 1);
  });

  await t.test('TESTE 10: mensagem orgânica não vira conversão de anúncio', async () => {
    const before = (await sql('select count(*)::int as n from conversion_leads'))[0].n;
    const result = await ingest({ phoneId: '5550001', waba: '7770001', click: null, messageId: 'wamid-organico' });

    assert.equal(result.length, 0);
    assert.equal((await sql('select count(*)::int as n from conversion_leads'))[0].n, before);
    // O webhook orgânico ainda prova que a integração está viva.
    assert.notEqual((await sql('select last_webhook_at from client_whatsapp_connections where client_id=$1', [clientA]))[0].last_webhook_at, null);
  });

  await t.test('TESTE C: um evento do cliente A nunca sai pelo Dataset do cliente B', async () => {
    const rows = await queue();
    for (const row of rows) {
      const owner = (await sql('select client_id from conversion_leads where id=$1', [row.lead_id]))[0].client_id;
      const expected = (await sql('select dataset_id, waba_id from client_whatsapp_connections where client_id=$1', [owner]))[0];
      assert.equal(row.dataset_id, expected.dataset_id);
      if (row.action_source === 'business_messaging') {
        assert.equal(row.user_data.whatsapp_business_account_id, expected.waba_id);
      }
    }
    // A conexão oficial substitui a credencial manual antiga.
    assert.equal(rows.every((row) => row.credential_source === 'official'), true);
    assert.equal(rows.some((row) => row.dataset_id === '880001'), true);
    assert.equal(rows.every((row) => row.access_token === 'sealed-token'), true);
  });


  await t.test('FASE HÍBRIDA: todo cliente começa no fluxo antigo e ele continua captando', async () => {
    // A migração é aditiva: um cliente novo nasce no fluxo antigo, sempre.
    await service();
    const fresh = '10000000-0000-4000-8000-000000000009';
    await sql('insert into clients(id) values($1)', [fresh]);
    assert.equal(await mode(fresh), 'legacy_waha');

    // Os testes anteriores já conectaram e promoveram o cliente A — que é o
    // comportamento correto. Aqui o cenário híbrido é montado do zero.
    await sql(`update clients set conversion_ingest_mode='legacy_waha' where id in ($1,$2)`, [clientA, clientB]);
    assert.equal(await mode(clientA), 'legacy_waha');
    assert.equal(await mode(clientB), 'legacy_waha');

    // waha_ingest_lead continua existindo e criando lead normalmente.
    const [row] = await wahaIngest({ click: 'clid-legado-1', phone: '5511970002222' });
    assert.equal(row.novo, true);

    const created = (await sql('select * from conversion_leads where id=$1', [row.lead_id]))[0];
    assert.equal(created.client_id, clientA);
    assert.equal(created.ctwa_clid, 'clid-legado-1');
    assert.equal(created.origem, 'anuncio');
    // E o marco entra na mesma fila do pipeline novo.
    assert.equal((await events(row.lead_id)).some((e) => e.event_name === 'LeadSubmitted'), true);
  });

  await t.test('FASE HÍBRIDA: repetir a ingestão legada não duplica o lead', async () => {
    const [first] = await wahaIngest({ click: 'clid-legado-2', eventId: 'waha-fixo' });
    const [again] = await wahaIngest({ click: 'clid-legado-2', eventId: 'waha-fixo' });
    assert.equal(again.novo, false);
    assert.equal(again.lead_id, first.lead_id);
  });

  await t.test('FASE HÍBRIDA: Meta oficial e WAHA vendo a mesma mensagem criam UM lead só', async () => {
    // Cliente ainda em legacy_waha, mas o webhook oficial já chegou primeiro.
    await service();
    await sql(`update clients set conversion_ingest_mode='legacy_waha' where id=$1`, [clientA]);
    await sql(`update client_whatsapp_connections set status='whatsapp_connected' where client_id=$1`, [clientA]);

    const [oficial] = await ingest({
      phoneId: '5550001', waba: '7770001', click: 'clid-cruzado', messageId: 'wamid-cruzado',
      phone: '5511970003333',
    });
    assert.equal(oficial.novo, true);

    // O WAHA enxerga a MESMA conversa, com outro id de mensagem. O ctwa_clid é
    // a chave que cruza os dois pipelines.
    const [legado] = await wahaIngest({
      click: 'clid-cruzado', phone: '5511970003333', eventId: 'waha-cruzado',
    });
    assert.equal(legado.novo, false);
    assert.equal(legado.lead_id, oficial.lead_id);

    const total = await sql('select count(*)::int as n from conversion_leads where ctwa_clid=$1', ['clid-cruzado']);
    assert.equal(total[0].n, 1);
    // O vínculo original com o anúncio não foi sobrescrito pelo legado.
    const lead = (await sql('select * from conversion_leads where id=$1', [oficial.lead_id]))[0];
    assert.equal(lead.ctwa_clid, 'clid-cruzado');
    assert.equal(lead.wa_message_id, 'wamid-cruzado');
  });

  await t.test('FASE HÍBRIDA: promoção automática só depois da integração provar que entrega', async () => {
    await service();
    await sql(`update clients set conversion_ingest_mode='legacy_waha' where id=$1`, [clientA]);

    // Conexão incompleta (sem webhook assinado): não promove.
    await sql(`update client_whatsapp_connections set webhook_subscribed=false, status='active' where client_id=$1`, [clientA]);
    await ingest({ phoneId: '5550001', waba: '7770001', click: null, messageId: 'wamid-sem-webhook' });
    assert.equal(await mode(clientA), 'legacy_waha');

    // Promover à força também é recusado enquanto não estiver saudável.
    await assert.rejects(
      sql(`select admin_set_conversion_ingest_mode($1,'official_meta')`, [clientA]),
      /ainda não está completa/,
    );

    // Integração completa + webhook oficial entregando: aí sim promove.
    await sql(`update client_whatsapp_connections set webhook_subscribed=true, status='active' where client_id=$1`, [clientA]);
    await ingest({ phoneId: '5550001', waba: '7770001', click: null, messageId: 'wamid-promove' });
    assert.equal(await mode(clientA), 'official_meta');
  });

  await t.test('FASE HÍBRIDA: cliente migrado é ignorado pelo WAHA, sem afetar o Atendimento IA', async () => {
    assert.equal(await mode(clientA), 'official_meta');

    const before = (await sql('select count(*)::int as n from conversion_leads'))[0].n;
    const result = await wahaIngest({ click: 'clid-pos-migracao', phone: '5511970004444' });

    // Nada entra: as Conversões dele vêm do webhook oficial agora.
    assert.equal(result.length, 0);
    assert.equal((await sql('select count(*)::int as n from conversion_leads'))[0].n, before);

    // A sessão WAHA continua intacta — é a mesma que o Atendimento IA usa.
    assert.equal((await sql('select status from whatsapp_sessions where client_id=$1', [clientA]))[0].status, 'WORKING');
  });

  await t.test('FASE HÍBRIDA: A no oficial e B no legado funcionam ao mesmo tempo', async () => {
    assert.equal(await mode(clientA), 'official_meta');
    assert.equal(await mode(clientB), 'legacy_waha');

    // B continua entrando pelo fluxo antigo.
    const [legado] = await wahaIngest({
      session: 'sess-b', click: 'clid-b-legado', phone: '5511970005555', eventId: 'waha-b',
    });
    assert.equal(legado.novo, true);
    assert.equal((await sql('select client_id from conversion_leads where id=$1', [legado.lead_id]))[0].client_id, clientB);

    // A continua entrando pelo oficial.
    const [oficial] = await ingest({
      phoneId: '5550001', waba: '7770001', click: 'clid-a-oficial', messageId: 'wamid-a-oficial',
    });
    assert.equal(oficial.novo, true);
    assert.equal(oficial.client_id, clientA);

    // E um não vaza para o outro.
    assert.notEqual(legado.lead_id, oficial.lead_id);
  });

  await t.test('FASE HÍBRIDA: voltar um cliente ao legado é permitido para rollback', async () => {
    await service();
    await sql(`select admin_set_conversion_ingest_mode($1,'legacy_waha')`, [clientA]);
    assert.equal(await mode(clientA), 'legacy_waha');

    // E a captação antiga volta a funcionar imediatamente.
    const [row] = await wahaIngest({ click: 'clid-rollback', phone: '5511970006666' });
    assert.equal(row.novo, true);
  });


  await db.close();
});
