-- Harden and complete the WAHA -> qualification -> Meta CAPI pipeline.
-- Secrets stay in the private schema; browser roles only see tenant-scoped rows.

alter table public.clients
  add column if not exists meta_waba_id text;

comment on column public.clients.meta_waba_id is
  'WhatsApp Business Account ID linked to the client dataset for Business Messaging CAPI.';

alter table public.conversion_leads
  add column if not exists waha_event_id text,
  add column if not exists capi_claimed_at timestamptz,
  add column if not exists capi_next_attempt_at timestamptz;

comment on column public.conversion_leads.waha_event_id is
  'Unique WAHA webhook event/message id used to make ingestion idempotent.';
comment on column public.conversion_leads.capi_claimed_at is
  'Temporary lease acquired by a CAPI worker. Stale leases are released automatically.';
comment on column public.conversion_leads.capi_next_attempt_at is
  'Earliest time at which a failed CAPI event may be retried.';

create unique index if not exists conversion_leads_waha_event_id_key
  on public.conversion_leads (waha_event_id)
  where waha_event_id is not null;

create index if not exists conversion_leads_capi_retry_idx
  on public.conversion_leads (capi_next_attempt_at, criado_em)
  where qualificacao = 'qualificado'
    and capi_status in ('nao_enviado', 'erro');

alter table public.conversion_leads
  alter column capi_event_name set default 'LeadSubmitted';

update public.conversion_leads
set capi_event_name = 'LeadSubmitted'
where capi_event_name = 'Lead'
  and capi_status <> 'enviado';

-- Client-facing writes may only touch the two fields used by the qualification UI.
create or replace function private.guard_conversion_lead_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  jwt_role text;
  caller_id uuid;
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  caller_id := (select auth.uid());

  if jwt_role = 'service_role' then
    new.atualizado_em := now();
    return new;
  end if;

  if caller_id is null then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if not private.is_active_admin() then
    if new.client_id is distinct from old.client_id
       or new.campaign_id is distinct from old.campaign_id
       or new.telefone is distinct from old.telefone
       or new.email is distinct from old.email
       or new.nome is distinct from old.nome
       or new.ctwa_clid is distinct from old.ctwa_clid
       or new.ad_source_id is distinct from old.ad_source_id
       or new.ad_entry_point is distinct from old.ad_entry_point
       or new.valor is distinct from old.valor
       or new.moeda is distinct from old.moeda
       or new.capi_event_name is distinct from old.capi_event_name
       or new.capi_status is distinct from old.capi_status
       or new.capi_event_id is distinct from old.capi_event_id
       or new.capi_enviado_em is distinct from old.capi_enviado_em
       or new.capi_resposta is distinct from old.capi_resposta
       or new.capi_tentativas is distinct from old.capi_tentativas
       or new.capi_claimed_at is distinct from old.capi_claimed_at
       or new.capi_next_attempt_at is distinct from old.capi_next_attempt_at
       or new.waha_event_id is distinct from old.waha_event_id
       or new.qualificado_por is distinct from old.qualificado_por
       or new.qualificado_em is distinct from old.qualificado_em
       or new.criado_em is distinct from old.criado_em
    then
      raise exception 'Apenas os campos qualificacao e observacao podem ser alterados.'
        using errcode = '42501';
    end if;
  end if;

  if new.qualificacao is distinct from old.qualificacao then
    select app_user.id into actor_id
    from public.users as app_user
    where app_user.auth_user_id = caller_id;

    new.qualificado_por := actor_id;
    new.qualificado_em := now();

    if new.qualificacao = 'qualificado' and new.ctwa_clid is not null then
      if old.capi_status <> 'enviado' then
        new.capi_status := 'nao_enviado';
        new.capi_resposta := null;
        new.capi_claimed_at := null;
        new.capi_next_attempt_at := null;
      end if;
    elsif old.capi_status <> 'enviado' then
      new.capi_status := 'ignorado';
      new.capi_claimed_at := null;
      new.capi_next_attempt_at := null;
      new.capi_resposta := case
        when new.qualificacao = 'qualificado'
          then 'Sem ctwa_clid: não há vínculo seguro com um anúncio Click-to-WhatsApp.'
        else null
      end;
    end if;
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

-- Replace ingestion with an idempotent signature that receives the WAHA event id.
drop function if exists public.waha_ingest_lead(text, text, text, text, text, text);

create function public.waha_ingest_lead(
  p_session_name text,
  p_telefone text,
  p_nome text default null,
  p_ctwa_clid text default null,
  p_ad_source_id text default null,
  p_ad_entry_point text default null,
  p_event_id text default null
)
returns table(lead_id uuid, novo boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_id uuid;
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_session_name), '') is null
     or nullif(regexp_replace(coalesce(p_telefone, ''), '\\D', '', 'g'), '') is null
  then
    raise exception 'Sessão e telefone são obrigatórios.' using errcode = '22023';
  end if;

  select session.client_id into v_client
  from public.whatsapp_sessions as session
  where session.session_name = btrim(p_session_name);

  if v_client is null then
    raise exception 'Sessão não vinculada a nenhum cliente.' using errcode = '22023';
  end if;

  if nullif(btrim(p_event_id), '') is not null then
    select lead.id into v_id
    from public.conversion_leads as lead
    where lead.waha_event_id = btrim(p_event_id);

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;
  end if;

  if nullif(btrim(p_ctwa_clid), '') is not null then
    select lead.id into v_id
    from public.conversion_leads as lead
    where lead.ctwa_clid = btrim(p_ctwa_clid);

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;
  end if;

  select lead.id into v_id
  from public.conversion_leads as lead
  where lead.client_id = v_client
    and lead.telefone = regexp_replace(p_telefone, '\\D', '', 'g')
    and lead.criado_em > now() - interval '24 hours'
  order by lead.criado_em desc
  limit 1;

  if v_id is not null then
    update public.conversion_leads as lead
    set ctwa_clid = coalesce(lead.ctwa_clid, nullif(btrim(p_ctwa_clid), '')),
        ad_source_id = coalesce(lead.ad_source_id, nullif(btrim(p_ad_source_id), '')),
        ad_entry_point = coalesce(lead.ad_entry_point, nullif(btrim(p_ad_entry_point), '')),
        nome = coalesce(lead.nome, nullif(btrim(p_nome), '')),
        waha_event_id = coalesce(lead.waha_event_id, nullif(btrim(p_event_id), '')),
        capi_status = case
          when lead.qualificacao = 'qualificado'
               and lead.capi_status <> 'enviado'
               and coalesce(lead.ctwa_clid, nullif(btrim(p_ctwa_clid), '')) is not null
            then 'nao_enviado'::public.capi_send_status
          else lead.capi_status
        end,
        capi_next_attempt_at = case
          when lead.qualificacao = 'qualificado'
               and lead.capi_status <> 'enviado'
               and coalesce(lead.ctwa_clid, nullif(btrim(p_ctwa_clid), '')) is not null
            then null
          else lead.capi_next_attempt_at
        end,
        atualizado_em = now()
    where lead.id = v_id;

    return query select v_id, false;
    return;
  end if;

  insert into public.conversion_leads (
    client_id,
    telefone,
    nome,
    ctwa_clid,
    ad_source_id,
    ad_entry_point,
    waha_event_id,
    capi_event_name
  ) values (
    v_client,
    regexp_replace(p_telefone, '\\D', '', 'g'),
    nullif(btrim(p_nome), ''),
    nullif(btrim(p_ctwa_clid), ''),
    nullif(btrim(p_ad_source_id), ''),
    nullif(btrim(p_ad_entry_point), ''),
    nullif(btrim(p_event_id), ''),
    'LeadSubmitted'
  )
  returning id into v_id;

  return query select v_id, true;
end;
$$;

-- Meta credentials are changed only by an authenticated app admin or a trusted
-- service-role server action. The token itself never leaves the private schema
-- except through the narrow worker queue below.
drop function if exists public.admin_set_client_capi_config(uuid, text, text, text, boolean);

create function public.admin_set_client_capi_config(
  p_client_id uuid,
  p_dataset_id text default null,
  p_waba_id text default null,
  p_access_token text default null,
  p_capi_ativo boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  has_token boolean;
begin
  if jwt_role <> 'service_role' and not private.is_active_admin() then
    raise exception 'Apenas administradores podem alterar a configuração de CAPI.'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_dataset_id), '') is not null
     and btrim(p_dataset_id) !~ '^[0-9]{5,30}$'
  then
    raise exception 'ID do Dataset inválido.' using errcode = '22023';
  end if;

  if nullif(btrim(p_waba_id), '') is not null
     and btrim(p_waba_id) !~ '^[0-9]{5,30}$'
  then
    raise exception 'WABA ID inválido.' using errcode = '22023';
  end if;

  if nullif(btrim(p_access_token), '') is not null then
    insert into private.client_capi_credentials (client_id, access_token)
    values (p_client_id, btrim(p_access_token))
    on conflict (client_id) do update
      set access_token = excluded.access_token,
          atualizado_em = now();
  end if;

  select exists (
    select 1 from private.client_capi_credentials as credentials
    where credentials.client_id = p_client_id
  ) into has_token;

  if coalesce(p_capi_ativo, false)
     and (
       nullif(btrim(p_dataset_id), '') is null
       or nullif(btrim(p_waba_id), '') is null
       or not has_token
     )
  then
    raise exception 'Dataset, WABA ID e token são obrigatórios para ativar a CAPI.'
      using errcode = '22023';
  end if;

  update public.clients
  set meta_dataset_id = nullif(btrim(p_dataset_id), ''),
      meta_waba_id = nullif(btrim(p_waba_id), ''),
      capi_ativo = coalesce(p_capi_ativo, capi_ativo)
  where id = p_client_id;

  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

drop function if exists public.admin_client_capi_status();

create function public.admin_client_capi_status()
returns table(
  client_id uuid,
  nome_empresa text,
  meta_dataset_id text,
  meta_waba_id text,
  capi_ativo boolean,
  token_configurado boolean,
  leads_pendentes bigint,
  leads_na_fila bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return query
  select client.id,
         client.nome_empresa,
         client.meta_dataset_id,
         client.meta_waba_id,
         client.capi_ativo,
         credentials.client_id is not null,
         count(*) filter (where lead.qualificacao = 'pendente'),
         count(*) filter (
           where lead.qualificacao = 'qualificado'
             and lead.ctwa_clid is not null
             and lead.capi_status in ('nao_enviado', 'erro')
             and lead.capi_tentativas < 5
         )
  from public.clients as client
  left join private.client_capi_credentials as credentials
    on credentials.client_id = client.id
  left join public.conversion_leads as lead
    on lead.client_id = client.id
  group by client.id,
           client.nome_empresa,
           client.meta_dataset_id,
           client.meta_waba_id,
           client.capi_ativo,
           credentials.client_id
  order by client.nome_empresa;
end;
$$;

-- Claim queue rows atomically. SKIP LOCKED prevents two n8n executions from
-- sending the same lead; an abandoned lease becomes available after 10 minutes.
drop function if exists public.capi_fetch_queue(integer);

create function public.capi_fetch_queue(p_limit integer default 50)
returns table(
  lead_id uuid,
  dataset_id text,
  waba_id text,
  access_token text,
  event_name text,
  event_id text,
  event_time bigint,
  ctwa_clid text,
  valor numeric,
  moeda text,
  tentativas integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select lead.id
    from public.conversion_leads as lead
    join public.clients as client on client.id = lead.client_id
    join private.client_capi_credentials as credentials
      on credentials.client_id = lead.client_id
    where lead.qualificacao = 'qualificado'
      and lead.ctwa_clid is not null
      and lead.capi_status in ('nao_enviado', 'erro')
      and lead.capi_tentativas < 5
      and coalesce(lead.capi_next_attempt_at, '-infinity'::timestamptz) <= now()
      and (
        lead.capi_claimed_at is null
        or lead.capi_claimed_at < now() - interval '10 minutes'
      )
      and client.capi_ativo
      and client.meta_dataset_id is not null
      and client.meta_waba_id is not null
    order by lead.criado_em
    for update of lead skip locked
    limit greatest(1, least(p_limit, 200))
  ), claimed as (
    update public.conversion_leads as lead
    set capi_claimed_at = now(),
        capi_event_id = coalesce(lead.capi_event_id, 'cl_' || lead.id::text),
        atualizado_em = now()
    from candidates
    where lead.id = candidates.id
    returning lead.*
  )
  select claimed.id,
         client.meta_dataset_id,
         client.meta_waba_id,
         credentials.access_token,
         claimed.capi_event_name,
         claimed.capi_event_id,
         extract(epoch from coalesce(claimed.qualificado_em, claimed.criado_em))::bigint,
         claimed.ctwa_clid,
         claimed.valor,
         claimed.moeda,
         claimed.capi_tentativas
  from claimed
  join public.clients as client on client.id = claimed.client_id
  join private.client_capi_credentials as credentials
    on credentials.client_id = claimed.client_id
  order by claimed.criado_em;
end;
$$;

create or replace function public.capi_mark_result(
  p_lead_id uuid,
  p_event_id text,
  p_ok boolean,
  p_resposta text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  update public.conversion_leads as lead
  set capi_status = case
        when p_ok then 'enviado'::public.capi_send_status
        else 'erro'::public.capi_send_status
      end,
      capi_event_id = coalesce(lead.capi_event_id, nullif(btrim(p_event_id), '')),
      capi_enviado_em = case when p_ok then now() else lead.capi_enviado_em end,
      capi_resposta = left(coalesce(p_resposta, ''), 2000),
      capi_tentativas = lead.capi_tentativas + 1,
      capi_claimed_at = null,
      capi_next_attempt_at = case
        when p_ok then null
        else now() + make_interval(
          mins => least(60, (power(2, least(lead.capi_tentativas, 5))::integer) * 5)
        )
      end,
      atualizado_em = now()
  where lead.id = p_lead_id
    and lead.capi_event_id = p_event_id;

  if not found then
    raise exception 'Lead ou event_id inválido.' using errcode = '22023';
  end if;
end;
$$;

-- Explicit least-privilege grants for all exposed objects in this pipeline.
revoke all on table public.conversion_leads from anon;
revoke all on table public.whatsapp_sessions from anon;
revoke all on table public.clients from anon;

revoke all on table public.conversion_leads from authenticated;
grant select on table public.conversion_leads to authenticated;
grant update (qualificacao, observacao) on table public.conversion_leads to authenticated;

revoke all on table public.whatsapp_sessions from authenticated;
grant select on table public.whatsapp_sessions to authenticated;

revoke all on table public.clients from authenticated;
grant select on table public.clients to authenticated;

grant all on table public.conversion_leads to service_role;
grant all on table public.whatsapp_sessions to service_role;
grant all on table public.clients to service_role;

revoke all on schema private from public, anon, authenticated;
revoke all on table private.client_capi_credentials from public, anon, authenticated;

revoke all on function public.waha_ingest_lead(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.waha_ingest_lead(text, text, text, text, text, text, text)
  to service_role;

revoke all on function public.waha_update_session_status(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.waha_update_session_status(text, text, text, text, text)
  to service_role;

revoke all on function public.capi_fetch_queue(integer)
  from public, anon, authenticated;
grant execute on function public.capi_fetch_queue(integer) to service_role;

revoke all on function public.capi_mark_result(uuid, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.capi_mark_result(uuid, text, boolean, text)
  to service_role;

revoke all on function public.admin_set_client_capi_config(uuid, text, text, text, boolean)
  from public, anon;
grant execute on function public.admin_set_client_capi_config(uuid, text, text, text, boolean)
  to authenticated, service_role;

revoke all on function public.admin_client_capi_status()
  from public, anon;
grant execute on function public.admin_client_capi_status() to authenticated;

revoke all on function public.admin_clear_client_capi_token(uuid)
  from public, anon;
grant execute on function public.admin_clear_client_capi_token(uuid) to authenticated;
