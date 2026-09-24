-- Conversões deixam de ser exclusivas do nicho de compra de veículos.
--
-- Dois modelos de negócio, escolhidos POR CLIENTE:
--
--   vehicle_acquisition  a empresa COMPRA do lead (ex.: LS Motors).
--                        Fechamento = VehicleAcquired, evento personalizado,
--                        server-side. O dinheiro é CUSTO de aquisição e nunca
--                        vai para a Meta como receita.
--
--   sale                 a empresa VENDE para o lead (ex.: Tráfego Academy).
--                        Fechamento = Purchase, no contexto de Business
--                        Messaging, com value/currency em custom_data.
--
-- ADITIVA. A migração 20260924210000 já foi aplicada em produção e não é
-- tocada aqui: nada de waha_ingest_lead, leads_webhook_url ou drop destrutivo.
-- Todo cliente existente continua em vehicle_acquisition, sem reclassificar
-- nem reenviar um único evento histórico.

-- ---------------------------------------------------------------------------
-- 1. Modelo de conversão por cliente.
--    Separado de `segmento`: nicho e modelo de conversão são coisas
--    diferentes, e derivar um do outro seria frágil.
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists conversion_goal_type text not null
    default 'vehicle_acquisition';

comment on column public.clients.conversion_goal_type is
  'Resultado final do negócio: vehicle_acquisition (a empresa compra do lead; valor = custo) ou sale (a empresa vende ao lead; valor = receita).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_conversion_goal_type_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_conversion_goal_type_check
      check (conversion_goal_type in ('vehicle_acquisition', 'sale'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. A fila guarda o valor do marco no momento em que ele foi criado.
--    Mudar a configuração do cliente depois não reescreve um evento já
--    enfileirado — o snapshot é imutável, como event_time e user_data.
-- ---------------------------------------------------------------------------

alter table private.conversion_events
  add column if not exists custom_data jsonb;

comment on column private.conversion_events.custom_data is
  'Snapshot de value/currency do Purchase. Nulo para os demais eventos: custo de aquisição de veículo nunca entra aqui.';

-- ---------------------------------------------------------------------------
-- 3. Montagem do marco. É aqui que o modelo do cliente vira payload.
-- ---------------------------------------------------------------------------

create or replace function private.enqueue_conversion_event(
  p_lead public.conversion_leads,
  p_name text,
  p_time timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_data jsonb;
  v_custom jsonb := null;
  v_phone text;
  v_click text := nullif(btrim(p_lead.ctwa_clid), '');
  v_status public.capi_send_status := 'nao_enviado';
  v_response text := null;
  v_source text;
begin
  if p_name = 'VehicleAcquired' then
    -- Aquisição fechada por contrato, fora da conversa. Nenhum dado
    -- financeiro, do veículo ou da negociação sai daqui: só o telefone.
    v_source := 'other';
    v_phone := regexp_replace(p_lead.telefone, '[^0-9]', '', 'g');
    v_data := case when length(v_phone) between 10 and 15
      then jsonb_build_object('ph', jsonb_build_array(encode(sha256(convert_to(v_phone, 'UTF8')), 'hex')))
      else '{}'::jsonb end;
    if v_data = '{}'::jsonb then
      v_status := 'ignorado';
      v_response := 'Telefone fora do formato internacional: sem correspondência possível.';
    end if;
  else
    -- LeadSubmitted, QualifiedLead e Purchase pertencem ao contexto de
    -- Business Messaging e viajam com o identificador original do clique.
    v_source := 'business_messaging';
    v_data := jsonb_build_object('ctwa_clid', v_click);

    if p_name = 'Purchase' then
      -- Receita real da venda. Só existe quando alguém registrou o valor.
      if p_lead.valor is null or p_lead.valor <= 0 then
        v_status := 'ignorado';
        v_response := 'Venda sem valor registrado.';
      else
        v_custom := jsonb_build_object(
          'currency', upper(coalesce(nullif(btrim(p_lead.moeda), ''), 'BRL')),
          'value', round(p_lead.valor::numeric, 2)
        );
      end if;
    end if;

    if v_click is null then
      v_status := 'ignorado';
      -- Preferimos registrar a venda sem atribuição a inventar um clique.
      v_response := 'Sem vínculo com anúncio: registrado apenas internamente.';
    end if;
  end if;

  insert into private.conversion_events (
    event_id, lead_id, event_name, action_source, event_time,
    user_data, custom_data, status, response
  )
  values (
    'cl_' || p_lead.id::text || '_' || lower(p_name), p_lead.id, p_name,
    v_source, p_time, v_data, v_custom, v_status, v_response
  )
  on conflict (lead_id, event_name) do update
    set status = excluded.status,
        user_data = excluded.user_data,
        custom_data = excluded.custom_data,
        response = excluded.response
    -- Um marco realmente sem identificador, ou cancelado antes do envio, pode
    -- ser reativado. Evento confirmado, tentado ou reservado nunca é reenviado
    -- por um arrastar de cartão nem por uma edição de valor.
    where conversion_events.status = 'ignorado'
      and conversion_events.attempts = 0
      and conversion_events.claimed_at is null;
end;
$$;

revoke all on function private.enqueue_conversion_event(public.conversion_leads, text, timestamptz)
  from public, anon, authenticated;

-- O marco final passa a depender do modelo do cliente.
create or replace function private.capture_conversion_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_stage_changed boolean;
  v_event private.conversion_events;
  v_goal text;
  v_final text;
begin
  if tg_op = 'UPDATE' then
    v_stage_changed := new.qualificacao is distinct from old.qualificacao;
    -- Editar só o valor NÃO mexe na fila: um Purchase já enviado não é
    -- duplicado por correção de valor. A conciliação é sempre explícita.
    if not v_stage_changed and new.ctwa_clid is not distinct from old.ctwa_clid then
      return new;
    end if;
  else
    v_stage_changed := true;
  end if;

  select client.conversion_goal_type into v_goal
  from public.clients as client where client.id = new.client_id;

  v_final := case when coalesce(v_goal, 'vehicle_acquisition') = 'sale'
    then 'Purchase' else 'VehicleAcquired' end;

  perform private.enqueue_conversion_event(new, 'LeadSubmitted', new.criado_em);
  if v_stage_changed then new.qualificado_em := now(); end if;

  if new.qualificacao = 'qualificado' then
    perform private.enqueue_conversion_event(new, 'QualifiedLead', coalesce(new.qualificado_em, now()));
  elsif new.qualificacao = 'fechado' then
    perform private.enqueue_conversion_event(new, v_final, coalesce(new.qualificado_em, now()));
  end if;

  -- Uma correção antes do worker reservar o evento cancela aquele marco.
  update private.conversion_events set status = 'ignorado', response = 'Etapa corrigida antes do envio.'
  where lead_id = new.id and claimed_at is null and attempts = 0 and status = 'nao_enviado'
    and ((event_name = 'QualifiedLead' and new.qualificacao in ('pendente', 'desqualificado'))
      or (event_name in ('VehicleAcquired', 'Purchase') and new.qualificacao <> 'fechado'));

  new.capi_event_name := case new.qualificacao
    when 'fechado' then v_final when 'qualificado' then 'QualifiedLead' else 'LeadSubmitted' end;
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

-- ---------------------------------------------------------------------------
-- 4. Guarda de escrita. Para quem VENDE, o valor é obrigatório no fechamento:
--    sem ele não há receita a registrar e o Purchase não teria sentido.
--    Para quem COMPRA, continua opcional — é custo interno.
-- ---------------------------------------------------------------------------

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
  v_goal text;
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

  if new.qualificacao = 'desqualificado'
     and new.qualificacao is distinct from old.qualificacao
  then
    raise exception 'A etapa Desqualificado foi removida do funil.'
      using errcode = '22023';
  end if;

  is_closing := new.qualificacao = 'fechado';

  if not private.is_active_admin() then
    if new.client_id is distinct from old.client_id
       or new.campaign_id is distinct from old.campaign_id
       or new.telefone is distinct from old.telefone
       or new.email is distinct from old.email
       or new.nome is distinct from old.nome
       or new.ctwa_clid is distinct from old.ctwa_clid
       or new.ad_source_id is distinct from old.ad_source_id
       or new.ad_entry_point is distinct from old.ad_entry_point
       or new.ad_source_url is distinct from old.ad_source_url
       or new.ad_source_type is distinct from old.ad_source_type
       or new.origem is distinct from old.origem
       or new.wa_message_id is distinct from old.wa_message_id
       or new.phone_number_id is distinct from old.phone_number_id
       or new.waba_id is distinct from old.waba_id
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
    select client.conversion_goal_type into v_goal
    from public.clients as client where client.id = new.client_id;

    if coalesce(v_goal, 'vehicle_acquisition') = 'sale'
       and (new.valor is null or new.valor <= 0)
    then
      raise exception 'Informe o valor da venda.' using errcode = '22023';
    end if;

    if new.valor is not null then
      if new.valor <= 0 then
        raise exception 'O valor informado precisa ser maior que zero.'
          using errcode = '22023';
      end if;

      new.moeda := upper(btrim(coalesce(new.moeda, 'BRL')));
      if new.moeda !~ '^[A-Z]{3}$' then
        raise exception 'A moeda deve usar um código ISO de três letras.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  if new.qualificacao is distinct from old.qualificacao then
    select app_user.id into actor_id
    from public.users as app_user
    where app_user.auth_user_id = caller_id;

    new.qualificado_por := actor_id;
    new.qualificado_em := now();
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

revoke all on function private.guard_conversion_lead_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. A fila entrega o snapshot de valor junto com o evento.
-- ---------------------------------------------------------------------------

drop function if exists public.capi_fetch_queue(integer);
create function public.capi_fetch_queue(p_limit integer default 50)
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
  tentativas integer,
  action_source text,
  user_data jsonb,
  credential_source text,
  custom_data jsonb
)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
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
  with resolved as (
    select c.id as client_id,
      coalesce(connection.dataset_id, c.meta_dataset_id) as dataset_id,
      coalesce(connection.waba_id, c.meta_waba_id) as waba_id,
      coalesce(official.access_token, legacy.access_token) as access_token,
      case when official.access_token is not null then 'official' else 'legacy' end as credential_source,
      c.capi_ativo
    from public.clients c
    left join public.client_whatsapp_connections connection on connection.client_id = c.id
    left join private.client_whatsapp_credentials official on official.client_id = c.id
    left join private.client_capi_credentials legacy on legacy.client_id = c.id
  ), candidates as (
    select e.event_id from private.conversion_events e
    join public.conversion_leads l on l.id = e.lead_id
    join resolved r on r.client_id = l.client_id
    where e.status in ('nao_enviado', 'erro') and e.attempts < 5 and e.claimed_at is null
      and coalesce(e.next_attempt_at, '-infinity'::timestamptz) <= now()
      and r.capi_ativo and r.dataset_id is not null and r.access_token is not null
      and (e.action_source <> 'business_messaging' or r.waba_id is not null)
      and e.event_time <= now()
    order by e.event_time, e.event_id
    for update of e skip locked limit greatest(1, least(p_limit, 50))
  ), claimed as (
    update private.conversion_events e set claimed_at = now()
    from candidates where candidates.event_id = e.event_id returning e.*
  )
  select e.lead_id, r.dataset_id, r.waba_id, r.access_token,
    e.event_name, e.event_id, extract(epoch from e.event_time)::bigint,
    e.user_data ->> 'ctwa_clid', null::numeric, null::text, e.attempts, e.action_source,
    case when e.action_source = 'business_messaging'
      then e.user_data || jsonb_build_object('whatsapp_business_account_id', r.waba_id)
      else e.user_data end,
    r.credential_source,
    e.custom_data
  from claimed e join public.conversion_leads l on l.id = e.lead_id
  join resolved r on r.client_id = l.client_id
  order by e.event_time, e.event_id;
end;
$$;
revoke all on function public.capi_fetch_queue(integer) from public, anon, authenticated;
grant execute on function public.capi_fetch_queue(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Troca do modelo pelo administrador. Com histórico de conversões, exige
--    confirmação explícita: o modelo decide qual evento o próximo fechamento
--    gera, e trocar no meio do caminho muda o significado do funil.
--    Eventos já enfileirados nunca são reescritos.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_conversion_goal_type(
  p_client_id uuid,
  p_goal text,
  p_confirm boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_history bigint;
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
     and not private.is_active_admin()
  then
    raise exception 'Apenas administradores podem alterar o modelo de conversão.'
      using errcode = '42501';
  end if;

  if p_goal not in ('vehicle_acquisition', 'sale') then
    raise exception 'Modelo de conversão inválido.' using errcode = '22023';
  end if;

  select client.conversion_goal_type into v_current
  from public.clients as client where client.id = p_client_id;

  if v_current is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  if v_current = p_goal then
    return;
  end if;

  select count(*) into v_history
  from private.conversion_events as event
  join public.conversion_leads as lead on lead.id = event.lead_id
  where lead.client_id = p_client_id
    and event.event_name in ('VehicleAcquired', 'Purchase');

  if v_history > 0 and not coalesce(p_confirm, false) then
    raise exception
      'Este cliente já tem % fechamento(s) registrado(s). Confirme a troca do modelo de conversão.',
      v_history using errcode = '22023';
  end if;

  update public.clients set conversion_goal_type = p_goal where id = p_client_id;
end;
$$;

revoke all on function public.admin_set_conversion_goal_type(uuid, text, boolean)
  from public, anon;
grant execute on function public.admin_set_conversion_goal_type(uuid, text, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Diagnóstico: o administrador precisa ver o modelo de cada cliente.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_client_capi_status();
create function public.admin_client_capi_status()
returns table(
  client_id uuid, nome_empresa text, meta_dataset_id text, meta_waba_id text,
  phone_number_id text, display_phone_number text, connection_status text,
  is_on_biz_app boolean, platform_type text, webhook_subscribed boolean,
  last_webhook_at timestamptz, last_lead_at timestamptz, last_conversion_at timestamptz,
  last_error text, capi_ativo boolean, token_configurado boolean,
  leads_pendentes bigint, leads_na_fila bigint, eventos_com_erro bigint,
  ingest_mode text, goal_type text
)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
  select c.id,
    c.nome_empresa,
    coalesce(connection.dataset_id, c.meta_dataset_id),
    coalesce(connection.waba_id, c.meta_waba_id),
    connection.phone_number_id,
    connection.display_phone_number,
    coalesce(connection.status::text, 'not_connected'),
    connection.is_on_biz_app,
    connection.platform_type,
    coalesce(connection.webhook_subscribed, false),
    connection.last_webhook_at,
    connection.last_lead_at,
    connection.last_conversion_at,
    connection.last_error,
    c.capi_ativo,
    exists(select 1 from private.client_whatsapp_credentials cr where cr.client_id = c.id)
      or exists(select 1 from private.client_capi_credentials cr where cr.client_id = c.id),
    (select count(*) from public.conversion_leads l
      where l.client_id = c.id and l.qualificacao = 'pendente'),
    (select count(*) from private.conversion_events e
      join public.conversion_leads l on l.id = e.lead_id
      where l.client_id = c.id and e.status in ('nao_enviado', 'erro') and e.attempts < 5),
    (select count(*) from private.conversion_events e
      join public.conversion_leads l on l.id = e.lead_id
      where l.client_id = c.id and e.status = 'erro' and e.attempts >= 5),
    c.conversion_ingest_mode,
    c.conversion_goal_type
  from public.clients c
  left join public.client_whatsapp_connections connection on connection.client_id = c.id
  order by c.nome_empresa;
end;
$$;
revoke all on function public.admin_client_capi_status() from public, anon, authenticated;
grant execute on function public.admin_client_capi_status() to service_role;

create or replace function public.conversion_pipeline_version()
returns integer language sql stable security invoker set search_path = '' as $$ select 4; $$;
revoke all on function public.conversion_pipeline_version() from public, anon;
grant execute on function public.conversion_pipeline_version() to authenticated, service_role;
