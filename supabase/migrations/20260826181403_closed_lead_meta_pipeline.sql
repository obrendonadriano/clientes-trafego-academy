-- Etapas comerciais e eventos aceitos pela Conversions API de mensagens:
--   qualificado -> QualifiedLead
--   fechado     -> Purchase (com valor e moeda)
-- A desqualificação é mantida apenas no CRM. A Meta não aceita um evento
-- negativo equivalente para action_source=business_messaging.

drop index if exists public.conversion_leads_capi_retry_idx;
create index conversion_leads_capi_retry_idx
  on public.conversion_leads (capi_next_attempt_at, criado_em)
  where qualificacao in ('qualificado', 'fechado')
    and capi_status in ('nao_enviado', 'erro');

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
  is_closing boolean;
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

  is_closing := new.qualificacao = 'fechado'
    and new.qualificacao is distinct from old.qualificacao;

  if not private.is_active_admin() then
    if new.client_id is distinct from old.client_id
       or new.campaign_id is distinct from old.campaign_id
       or new.telefone is distinct from old.telefone
       or new.email is distinct from old.email
       or new.nome is distinct from old.nome
       or new.ctwa_clid is distinct from old.ctwa_clid
       or new.ad_source_id is distinct from old.ad_source_id
       or new.ad_entry_point is distinct from old.ad_entry_point
       or (
         (new.valor is distinct from old.valor or new.moeda is distinct from old.moeda)
         and not is_closing
       )
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
      raise exception 'Apenas qualificação, observação e o valor de um novo fechamento podem ser alterados.'
        using errcode = '42501';
    end if;
  end if;

  if new.qualificacao = 'fechado' then
    if new.valor is null or new.valor <= 0 then
      raise exception 'Informe um valor maior que zero para fechar o negócio.'
        using errcode = '22023';
    end if;

    new.moeda := upper(btrim(coalesce(new.moeda, '')));
    if new.moeda !~ '^[A-Z]{3}$' then
      raise exception 'A moeda deve usar um código ISO de três letras.'
        using errcode = '22023';
    end if;
  end if;

  if new.qualificacao is distinct from old.qualificacao then
    select app_user.id into actor_id
    from public.users as app_user
    where app_user.auth_user_id = caller_id;

    new.qualificado_por := actor_id;
    new.qualificado_em := now();

    if new.qualificacao in ('qualificado', 'fechado') then
      new.capi_event_name := case
        when new.qualificacao = 'fechado' then 'Purchase'
        else 'QualifiedLead'
      end;
      new.capi_event_id := null;
      new.capi_enviado_em := null;
      new.capi_tentativas := 0;
      new.capi_claimed_at := null;
      new.capi_next_attempt_at := null;

      if new.ctwa_clid is not null then
        new.capi_status := 'nao_enviado';
        new.capi_resposta := null;
      else
        new.capi_status := 'ignorado';
        new.capi_resposta :=
          'Sem ctwa_clid: não há vínculo seguro com um anúncio Click-to-WhatsApp.';
      end if;
    elsif old.capi_status <> 'enviado' then
      new.capi_status := 'ignorado';
      new.capi_claimed_at := null;
      new.capi_next_attempt_at := null;
      new.capi_resposta := null;
    end if;
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

grant update (valor, moeda) on table public.conversion_leads to authenticated;

-- Corrige somente eventos que ainda não foram enviados. Os já enviados ficam
-- intactos para não duplicar conversões antigas.
update public.conversion_leads
set capi_event_name = 'QualifiedLead',
    capi_event_id = null,
    atualizado_em = now()
where qualificacao = 'qualificado'
  and capi_status <> 'enviado';

create or replace function public.waha_ingest_lead(
  p_session_name text,
  p_telefone text,
  p_nome text default null,
  p_ctwa_clid text default null,
  p_ad_source_id text default null,
  p_ad_entry_point text default null,
  p_event_id text default null
)
returns table (lead_id uuid, novo boolean)
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
          when lead.qualificacao in ('qualificado', 'fechado')
               and lead.capi_status <> 'enviado'
               and coalesce(lead.ctwa_clid, nullif(btrim(p_ctwa_clid), '')) is not null
            then 'nao_enviado'::public.capi_send_status
          else lead.capi_status
        end,
        capi_event_id = case
          when lead.qualificacao in ('qualificado', 'fechado')
               and lead.capi_status <> 'enviado'
               and coalesce(lead.ctwa_clid, nullif(btrim(p_ctwa_clid), '')) is not null
            then null
          else lead.capi_event_id
        end,
        capi_resposta = case
          when lead.qualificacao in ('qualificado', 'fechado')
               and lead.capi_status <> 'enviado'
               and coalesce(lead.ctwa_clid, nullif(btrim(p_ctwa_clid), '')) is not null
            then null
          else lead.capi_resposta
        end,
        capi_tentativas = case
          when lead.qualificacao in ('qualificado', 'fechado')
               and lead.capi_status <> 'enviado'
               and coalesce(lead.ctwa_clid, nullif(btrim(p_ctwa_clid), '')) is not null
            then 0
          else lead.capi_tentativas
        end,
        capi_next_attempt_at = case
          when lead.qualificacao in ('qualificado', 'fechado')
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

create or replace function public.capi_fetch_queue(p_limit integer default 50)
returns table (
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
    where lead.qualificacao in ('qualificado', 'fechado')
      and lead.ctwa_clid is not null
      and lead.capi_status in ('nao_enviado', 'erro')
      and lead.capi_tentativas < 5
      and (
        lead.capi_event_name <> 'Purchase'
        or (lead.valor > 0 and lead.moeda ~ '^[A-Z]{3}$')
      )
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
        capi_event_id = coalesce(
          lead.capi_event_id,
          'cl_' || lead.id::text || '_' || lower(lead.capi_event_name)
        ),
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

create or replace function public.admin_client_capi_status()
returns table (
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
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
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
           where lead.qualificacao in ('qualificado', 'fechado')
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

drop function if exists public.conversion_leads_summary(timestamptz, uuid);
create function public.conversion_leads_summary(
  p_start_date timestamptz default null,
  p_client_id uuid default null
)
returns table (
  total bigint,
  pending bigint,
  qualified bigint,
  discarded bigint,
  closed bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) as total,
    count(*) filter (where lead.qualificacao = 'pendente') as pending,
    count(*) filter (where lead.qualificacao = 'qualificado') as qualified,
    count(*) filter (where lead.qualificacao = 'desqualificado') as discarded,
    count(*) filter (where lead.qualificacao = 'fechado') as closed
  from public.conversion_leads as lead
  where (p_start_date is null or lead.criado_em >= p_start_date)
    and (p_client_id is null or lead.client_id = p_client_id);
$$;

revoke all on function public.conversion_leads_summary(timestamptz, uuid)
  from public, anon;
grant execute on function public.conversion_leads_summary(timestamptz, uuid)
  to authenticated, service_role;
