-- Each milestone has its own immutable time and delivery state. Do not replay
-- historical leads automatically: the old single-state queue lost their history.
create table private.conversion_events (
  event_id text primary key,
  lead_id uuid not null references public.conversion_leads(id) on delete cascade deferrable initially deferred,
  event_name text not null check (event_name in ('LeadSubmitted', 'QualifiedLead', 'VehicleAcquired', 'Purchase')),
  action_source text not null check (action_source in ('business_messaging', 'other')),
  event_time timestamptz not null,
  user_data jsonb not null,
  status public.capi_send_status not null default 'nao_enviado',
  attempts integer not null default 0,
  claimed_at timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  response text,
  unique (lead_id, event_name)
);
alter table private.conversion_events enable row level security;
revoke all on private.conversion_events from public, anon, authenticated;
grant all on private.conversion_events to service_role;
create index conversion_events_queue_idx on private.conversion_events (next_attempt_at, event_time)
  where status in ('nao_enviado', 'erro') and attempts < 5;

-- Preserve known legacy outcomes without inferring or replaying missing stages.
insert into private.conversion_events (event_id, lead_id, event_name, action_source, event_time, user_data, status, sent_at, response, attempts)
select coalesce(capi_event_id, 'cl_' || id::text || '_' || lower(capi_event_name)), id,
  capi_event_name, 'business_messaging', coalesce(qualificado_em, criado_em),
  jsonb_build_object('ctwa_clid', ctwa_clid), 'enviado', capi_enviado_em, capi_resposta, capi_tentativas
from public.conversion_leads
where capi_status = 'enviado' and capi_event_name in ('LeadSubmitted', 'QualifiedLead', 'Purchase');

create function private.enqueue_conversion_event(p_lead public.conversion_leads, p_name text, p_time timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_data jsonb;
  v_phone text;
  v_status public.capi_send_status := 'nao_enviado';
begin
  if p_name = 'VehicleAcquired' then
    -- No financial hardship, vehicle details, notes or acquisition cost leave the CRM.
    v_phone := regexp_replace(p_lead.telefone, '[^0-9]', '', 'g');
    v_data := case when length(v_phone) between 10 and 15
      then jsonb_build_object('ph', jsonb_build_array(encode(sha256(convert_to(v_phone, 'UTF8')), 'hex')))
      else '{}'::jsonb end;
    if v_data = '{}'::jsonb then v_status := 'ignorado'; end if;
  else
    v_data := jsonb_build_object('ctwa_clid', nullif(btrim(p_lead.ctwa_clid), ''));
    if nullif(btrim(p_lead.ctwa_clid), '') is null then v_status := 'ignorado'; end if;
  end if;
  insert into private.conversion_events (event_id, lead_id, event_name, action_source, event_time, user_data, status)
  values ('cl_' || p_lead.id::text || '_' || lower(p_name), p_lead.id, p_name,
    case when p_name = 'VehicleAcquired' then 'other' else 'business_messaging' end,
    p_time, v_data, v_status)
  on conflict (lead_id, event_name) do update
    set status = excluded.status, user_data = excluded.user_data, response = null
    -- A genuine missing identifier / cancelled unsent stage can be reactivated.
    -- Never resend acknowledged, attempted or in-flight events on a Kanban move.
    where conversion_events.status = 'ignorado'
      and conversion_events.attempts = 0 and conversion_events.claimed_at is null;
end;
$$;
revoke all on function private.enqueue_conversion_event(public.conversion_leads, text, timestamptz) from public, anon, authenticated;

create function private.capture_conversion_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_stage_changed boolean;
  v_event private.conversion_events;
begin
  if tg_op = 'UPDATE' then
    v_stage_changed := new.qualificacao is distinct from old.qualificacao;
    if not v_stage_changed and new.ctwa_clid is not distinct from old.ctwa_clid then
      return new;
    end if;
  else
    v_stage_changed := true;
  end if;

  perform private.enqueue_conversion_event(new, 'LeadSubmitted', new.criado_em);
  if v_stage_changed then new.qualificado_em := now(); end if;
  if new.qualificacao = 'qualificado' then
    perform private.enqueue_conversion_event(new, 'QualifiedLead', coalesce(new.qualificado_em, now()));
  elsif new.qualificacao = 'fechado' then
    if new.valor is null or new.valor <= 0 then
      raise exception 'Informe o valor pago pelo veículo.' using errcode = '22023';
    end if;
    perform private.enqueue_conversion_event(new, 'VehicleAcquired', coalesce(new.qualificado_em, now()));
  end if;

  -- A correction before the worker claims an event can cancel that milestone.
  -- Moving forward preserves earlier events even when the worker has not run yet.
  update private.conversion_events set status = 'ignorado', response = 'Etapa corrigida antes do envio.'
  where lead_id = new.id and claimed_at is null and attempts = 0 and status = 'nao_enviado'
    and ((event_name = 'QualifiedLead' and new.qualificacao in ('pendente', 'desqualificado'))
      or (event_name = 'VehicleAcquired' and new.qualificacao <> 'fechado'));

  new.capi_event_name := case new.qualificacao
    when 'fechado' then 'VehicleAcquired' when 'qualificado' then 'QualifiedLead' else 'LeadSubmitted' end;
  select * into v_event from private.conversion_events
    where lead_id = new.id and event_name = new.capi_event_name;
  new.capi_event_id := v_event.event_id;
  new.capi_status := v_event.status;
  new.capi_enviado_em := v_event.sent_at;
  new.capi_resposta := v_event.response;
  new.capi_tentativas := v_event.attempts;
  new.capi_claimed_at := v_event.claimed_at;
  new.capi_next_attempt_at := v_event.next_attempt_at;
  return new;
end;
$$;
revoke all on function private.capture_conversion_events() from public, anon, authenticated;
-- PostgreSQL executes BEFORE triggers alphabetically, after the existing guard.
create trigger zz_conversion_events_capture before insert or update on public.conversion_leads
  for each row execute function private.capture_conversion_events();

drop function public.capi_fetch_queue(integer);
create function public.capi_fetch_queue(p_limit integer default 50)
returns table (lead_id uuid, dataset_id text, waba_id text, access_token text,
  event_name text, event_id text, event_time bigint, ctwa_clid text, valor numeric,
  moeda text, tentativas integer, action_source text, user_data jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  -- Expired claims are ambiguous: Meta may have received the request. Messaging
  -- CAPI does not guarantee deduplication. Require reconciliation, never replay.
  update private.conversion_events e set status = 'erro', attempts = 5,
    response = 'Envio sem confirmação. Conferir no Gerenciador de Eventos antes de reenviar.'
  where e.claimed_at < now() - interval '30 minutes' and e.status <> 'enviado' and e.attempts < 5;
  update private.conversion_events e set status = 'erro', attempts = 5,
    response = 'Evento fora da janela de envio. A data original foi preservada.'
  where e.status in ('nao_enviado', 'erro') and e.claimed_at is null and e.attempts < 5
    and e.event_time < now() - interval '7 days';
  update public.conversion_leads l set capi_status = e.status, capi_resposta = e.response,
    capi_tentativas = e.attempts
  from private.conversion_events e
  where l.id = e.lead_id and l.capi_event_id = e.event_id and e.status = 'erro'
    and l.capi_status is distinct from e.status;
  return query
  with candidates as (
    select e.event_id from private.conversion_events e
    join public.conversion_leads l on l.id = e.lead_id
    join public.clients c on c.id = l.client_id
    join private.client_capi_credentials credentials on credentials.client_id = c.id
    where e.status in ('nao_enviado', 'erro') and e.attempts < 5 and e.claimed_at is null
      and coalesce(e.next_attempt_at, '-infinity'::timestamptz) <= now()
      and c.capi_ativo and c.meta_dataset_id is not null
      and (e.action_source <> 'business_messaging' or c.meta_waba_id is not null)
      and e.event_time <= now()
    order by e.event_time, e.event_id
    for update of e skip locked limit greatest(1, least(p_limit, 50))
  ), claimed as (
    update private.conversion_events e set claimed_at = now()
    from candidates where candidates.event_id = e.event_id returning e.*
  )
  select e.lead_id, c.meta_dataset_id, c.meta_waba_id, credentials.access_token,
    e.event_name, e.event_id, extract(epoch from e.event_time)::bigint,
    e.user_data ->> 'ctwa_clid', null::numeric, null::text, e.attempts, e.action_source,
    case when e.action_source = 'business_messaging'
      then e.user_data || jsonb_build_object('whatsapp_business_account_id', c.meta_waba_id)
      else e.user_data end
  from claimed e join public.conversion_leads l on l.id = e.lead_id
  join public.clients c on c.id = l.client_id
  join private.client_capi_credentials credentials on credentials.client_id = c.id
  order by e.event_time, e.event_id;
end;
$$;
revoke all on function public.capi_fetch_queue(integer) from public, anon, authenticated;
grant execute on function public.capi_fetch_queue(integer) to service_role;

drop function public.capi_mark_result(uuid, text, boolean, text);
create function public.capi_mark_result(p_lead_id uuid, p_event_id text, p_ok boolean,
  p_resposta text default null, p_retryable boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event private.conversion_events;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_event from private.conversion_events
    where lead_id = p_lead_id and event_id = p_event_id for update;
  if not found then raise exception 'Evento inválido.' using errcode = '22023'; end if;
  if v_event.status = 'enviado' then return; end if;
  if v_event.claimed_at is null then raise exception 'Evento não reservado.' using errcode = '22023'; end if;
  update private.conversion_events set
    status = case when p_ok then 'enviado'::public.capi_send_status else 'erro'::public.capi_send_status end,
    attempts = case when not p_ok and not p_retryable then 5 else attempts + 1 end,
    sent_at = case when p_ok then now() else sent_at end,
    response = left(coalesce(p_resposta, ''), 2000), claimed_at = null,
    next_attempt_at = case when not p_ok and p_retryable then now() + interval '5 minutes' * power(2, least(attempts, 4)) else null end
  where event_id = p_event_id returning * into v_event;
  -- A late acknowledgement of qualification must not mark acquisition as sent.
  update public.conversion_leads set capi_status = v_event.status,
    capi_enviado_em = v_event.sent_at, capi_resposta = v_event.response,
    capi_tentativas = v_event.attempts, capi_claimed_at = null,
    capi_next_attempt_at = v_event.next_attempt_at
  where id = p_lead_id and capi_event_id = p_event_id;
end;
$$;
revoke all on function public.capi_mark_result(uuid, text, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.capi_mark_result(uuid, text, boolean, text, boolean) to service_role;

create function public.conversion_pipeline_version() returns integer language sql stable security invoker set search_path = '' as $$ select 2; $$;
revoke all on function public.conversion_pipeline_version() from public, anon;
grant execute on function public.conversion_pipeline_version() to authenticated, service_role;

create or replace function public.admin_client_capi_status()
returns table(client_id uuid, nome_empresa text, meta_dataset_id text, meta_waba_id text,
  capi_ativo boolean, token_configurado boolean, leads_pendentes bigint, leads_na_fila bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query select c.id, c.nome_empresa, c.meta_dataset_id, c.meta_waba_id, c.capi_ativo,
    exists(select 1 from private.client_capi_credentials cr where cr.client_id=c.id),
    (select count(*) from public.conversion_leads l where l.client_id=c.id and l.qualificacao='pendente'),
    (select count(*) from private.conversion_events e join public.conversion_leads l on l.id=e.lead_id
      where l.client_id=c.id and e.status in ('nao_enviado','erro') and e.attempts<5)
  from public.clients c order by c.nome_empresa;
end;
$$;
revoke all on function public.admin_client_capi_status() from public, anon, authenticated;
grant execute on function public.admin_client_capi_status() to service_role;
