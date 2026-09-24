import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const clientId = '10000000-0000-4000-8000-000000000001';
const otherClient = '10000000-0000-4000-8000-000000000002';
const actor = '20000000-0000-4000-8000-000000000001';
const migration = readFileSync(new URL('../supabase/migrations/20260924020710_conversion_event_outbox.sql', import.meta.url), 'utf8');
const previous = readFileSync(new URL('../supabase/migrations/20260826181403_closed_lead_meta_pipeline.sql', import.meta.url), 'utf8');
const guard = previous.slice(previous.indexOf('create or replace function private.guard_conversion_lead_update()'), previous.indexOf('grant update (valor, moeda)'));

test('Postgres outbox: milestones, isolation, attribution and delivery recovery', async (t) => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create function private.is_active_admin() returns boolean language sql stable as $$ select false $$;
    create type public.lead_qualification as enum ('pendente','qualificado','desqualificado','fechado');
    create type public.capi_send_status as enum ('nao_enviado','enviado','erro','ignorado');
    create table public.clients(id uuid primary key, meta_dataset_id text, meta_waba_id text, capi_ativo boolean, nome_empresa text default 'Test');
    create table public.users(id uuid primary key, auth_user_id uuid, client_id uuid);
    create table private.client_capi_credentials(client_id uuid primary key, access_token text);
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
    insert into clients(id,meta_dataset_id,meta_waba_id,capi_ativo) values ('${clientId}','dataset-test','waba-test',true),('${otherClient}','dataset-other','waba-other',true);
    insert into public.users values ('${actor}','${actor}','${clientId}');
    insert into private.client_capi_credentials values ('${clientId}','test-only-token'),('${otherClient}','test-only-token');
  `);
  await db.exec(migration);
  const sql = async (query, params = []) => (await db.query(query, params)).rows;
  async function service() {
    await db.exec(`reset role; set request.jwt.claims = '{"role":"service_role"}'; set role service_role;`);
  }
  async function user() {
    await db.exec(`reset role; set request.jwt.claims = '{"role":"authenticated","sub":"${actor}"}'; set role authenticated;`);
  }
  async function lead({ click = 'click-test', tenant = clientId, days = 0, phone = '+55 (11) 99999-0001' } = {}) {
    await service();
    return (await sql(`insert into conversion_leads(client_id,telefone,ctwa_clid,criado_em) values($1,$2,$3,now()-$4::integer * interval '1 day') returning id`, [tenant, phone, click, days]))[0].id;
  }
  async function move(id, stage) {
    await user();
    await sql(`update conversion_leads set qualificacao=$2::public.lead_qualification, valor=case when $2::public.lead_qualification='fechado' then 25000 else valor end where id=$1`, [id, stage]);
    await service();
  }
  async function events(id) { return sql('select * from private.conversion_events where lead_id=$1 order by event_name', [id]); }
  async function queue() { await service(); return sql('select * from capi_fetch_queue(50)'); }
  async function ack(event, ok = true, retryable = false) {
    await service();
    await sql('select capi_mark_result($1,$2,$3,$4,$5)', [event.lead_id, event.event_id, ok, 'test', retryable]);
  }

  await t.test('initial → qualified → acquired keeps all three, no expense or debt in payload', async () => {
    const id = await lead();
    await move(id, 'qualificado'); await move(id, 'fechado');
    assert.deepEqual((await events(id)).map((e) => e.event_name), ['LeadSubmitted','QualifiedLead','VehicleAcquired']);
    const rows = (await queue()).filter((e) => e.lead_id === id);
    assert.equal(rows.length, 3);
    const closed = rows.find((e) => e.event_name === 'VehicleAcquired');
    assert.equal(closed.action_source, 'other');
    assert.deepEqual(closed.user_data, { ph: [createHash('sha256').update('5511999990001').digest('hex')] });
    assert.equal(closed.valor, null);
    assert.equal(rows.find((e) => e.event_name === 'QualifiedLead').user_data.whatsapp_business_account_id, 'waba-test');
    await ack(rows.find((e) => e.event_name === 'QualifiedLead'));
    assert.equal((await sql('select capi_status from conversion_leads where id=$1',[id]))[0].capi_status, 'nao_enviado');
    await ack(closed); await ack(rows.find((e) => e.event_name === 'LeadSubmitted'));
    await move(id, 'qualificado'); await move(id, 'fechado');
    assert.equal((await events(id)).length, 3);
    assert.equal((await queue()).filter((e) => e.lead_id === id).length, 0);
    assert.equal((await sql('select capi_status from conversion_leads where id=$1',[id]))[0].capi_status, 'enviado');
  });
  await t.test('cancelling an unsent qualification preserves the original occurrence time', async () => {
    const id = await lead(); await move(id, 'qualificado');
    const first = (await events(id)).find((e) => e.event_name === 'QualifiedLead');
    await move(id, 'desqualificado');
    assert.equal((await events(id)).find((e) => e.event_name === 'QualifiedLead').status, 'ignorado');
    await move(id, 'qualificado');
    const restored = (await events(id)).find((e) => e.event_name === 'QualifiedLead');
    assert.equal(restored.event_time.getTime(), first.event_time.getTime());
    assert.equal(restored.event_id, first.event_id);
  });
  await t.test('no click ID blocks messaging, but real offline acquisition uses hashed phone', async () => {
    const id = await lead({click:null}); await move(id, 'qualificado'); await move(id, 'fechado');
    assert.deepEqual((await events(id)).map((e) => e.status), ['ignorado','ignorado','nao_enviado']);
    assert.deepEqual((await queue()).filter((e) => e.lead_id === id).map((e) => e.event_name), ['VehicleAcquired']);
  });
  await t.test('expired dates and unknown delivery are never rewritten or automatically resent', async () => {
    const old = await lead({days:8});
    const time = (await events(old))[0].event_time;
    assert.equal((await queue()).some((e) => e.lead_id === old), false);
    assert.equal((await events(old))[0].event_time.getTime(), time.getTime());
    assert.equal((await events(old))[0].status, 'erro');
    const id = await lead(); const event = (await queue()).find((e) => e.lead_id === id);
    assert.equal((await queue()).some((e) => e.lead_id === id), false);
    await ack(event, false);
    assert.equal((await events(id))[0].attempts, 5);
    assert.equal((await queue()).some((e) => e.lead_id === id), false);
  });
  await t.test('transient explicit rejection has backoff; duplicate acknowledgements cannot regress success', async () => {
    const id = await lead(); const event = (await queue()).find((e) => e.lead_id === id);
    await ack(event, false, true);
    assert.equal((await queue()).some((e) => e.lead_id === id), false);
    await sql(`update private.conversion_events set next_attempt_at=now()-interval '1 second' where event_id=$1`, [event.event_id]);
    const retry = (await queue()).find((e) => e.lead_id === id);
    assert.equal(retry.event_id, event.event_id);
    assert.equal(retry.event_time, event.event_time);
    await ack(retry); await ack(retry, false);
    assert.equal((await events(id))[0].status, 'enviado');
  });
  await t.test('RLS and RPC permissions isolate tenants and protect secrets', async () => {
    const other = await lead({tenant:otherClient});
    await user();
    assert.equal((await sql('select id from conversion_leads where id=$1',[other])).length, 0);
    assert.equal((await sql(`update conversion_leads set qualificacao='qualificado' where id=$1 returning id`,[other])).length, 0);
    await assert.rejects(sql('select * from capi_fetch_queue(1)'), /permission denied/);
    await assert.rejects(sql('select * from private.conversion_events'), /permission denied/);
    await assert.rejects(sql(`update conversion_leads set ctwa_clid='forged'`), /permission denied/);
    await service();
    assert.equal((await events(other)).length, 1);
  });
  await db.close();
});
