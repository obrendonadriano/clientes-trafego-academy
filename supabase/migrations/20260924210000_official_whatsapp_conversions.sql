-- Conversões passam a depender apenas das APIs oficiais da Meta.
--
-- Entrada de leads: webhook oficial da Cloud API (Coexistence), roteado pelo
-- phone_number_id/waba_id já cadastrado — nunca por client_id vindo do payload.
-- Saída de eventos: a fila private.conversion_events já existente, agora
-- consumida por um worker da própria aplicação.
--
-- O WAHA continua existindo para o Atendimento por IA. Nada aqui o remove:
-- apenas a ingestão de leads de Conversões (waha_ingest_lead) sai de cena.

-- ---------------------------------------------------------------------------
-- 1. Conexão oficial por cliente. Sem segredos: esta tabela é legível pelo
--    cliente dono da linha. O token fica em private.client_whatsapp_credentials.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type
    where typname = 'wa_connection_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.wa_connection_status as enum (
      'not_connected',
      'onboarding',
      'whatsapp_connected',
      'dataset_pending',
      'active',
      'attention_required',
      'disconnected'
    );
  end if;
end
$$;

create table if not exists public.client_whatsapp_connections (
  client_id uuid primary key references public.clients(id) on delete cascade,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  business_id text,
  dataset_id text,
  status public.wa_connection_status not null default 'not_connected',
  -- Diagnóstico oficial de Coexistence: o número continua no app do celular.
  is_on_biz_app boolean,
  platform_type text,
  webhook_subscribed boolean not null default false,
  last_webhook_at timestamptz,
  last_lead_at timestamptz,
  last_conversion_at timestamptz,
  last_error text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.client_whatsapp_connections is
  'Uma conexão oficial de WhatsApp por cliente: WABA, número e Dataset de Conversões. Sem credenciais.';

-- Um WABA, um número e um Dataset pertencem a um único cliente. Sem isso, um
-- Dataset compartilhado misturaria sinais de clientes diferentes.
create unique index if not exists client_whatsapp_connections_waba_key
  on public.client_whatsapp_connections (waba_id) where waba_id is not null;
create unique index if not exists client_whatsapp_connections_phone_key
  on public.client_whatsapp_connections (phone_number_id) where phone_number_id is not null;
create unique index if not exists client_whatsapp_connections_dataset_key
  on public.client_whatsapp_connections (dataset_id) where dataset_id is not null;

alter table public.client_whatsapp_connections enable row level security;

drop policy if exists "admin manages whatsapp connections" on public.client_whatsapp_connections;
create policy "admin manages whatsapp connections"
on public.client_whatsapp_connections
for select
using ((select public.is_app_admin()));

drop policy if exists "client reads own whatsapp connection" on public.client_whatsapp_connections;
create policy "client reads own whatsapp connection"
on public.client_whatsapp_connections
for select
using (
  exists (
    select 1 from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.client_id = client_whatsapp_connections.client_id
      and app_user.ativo
  )
);

revoke all on table public.client_whatsapp_connections from public, anon, authenticated;
-- Escrita só pelas RPCs abaixo, que validam quem está chamando.
grant select on table public.client_whatsapp_connections to authenticated;
grant all on table public.client_whatsapp_connections to service_role;

-- ---------------------------------------------------------------------------
-- 2. Credenciais. Schema privado, fora do alcance de PostgREST e de RLS.
--    O valor chega já cifrado pela aplicação (AES-256-GCM).
-- ---------------------------------------------------------------------------

create table if not exists private.client_whatsapp_credentials (
  client_id uuid primary key references public.clients(id) on delete cascade,
  access_token text not null,
  token_scopes text,
  obtido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table private.client_whatsapp_credentials enable row level security;
revoke all on table private.client_whatsapp_credentials from public, anon, authenticated;
grant all on table private.client_whatsapp_credentials to service_role;

-- ---------------------------------------------------------------------------
-- 3. Procedência oficial do lead. waha_event_id continua existindo para não
--    perder o histórico; o identificador novo é o message id da Cloud API.
-- ---------------------------------------------------------------------------

alter table public.conversion_leads
  add column if not exists wa_message_id text,
  add column if not exists phone_number_id text,
  add column if not exists waba_id text,
  add column if not exists ad_source_url text,
  add column if not exists ad_source_type text,
  add column if not exists origem text not null default 'desconhecida';

comment on column public.conversion_leads.wa_message_id is
  'Message id da Cloud API que originou o lead. Chave de idempotência do webhook.';
comment on column public.conversion_leads.origem is
  'anuncio quando há referral Click-to-WhatsApp; organico quando não há.';

create unique index if not exists conversion_leads_wa_message_id_key
  on public.conversion_leads (wa_message_id) where wa_message_id is not null;

-- Um mesmo clique nunca vira dois leads, nem entre clientes diferentes.
-- Bancos antigos podem ter duplicatas vindas do pipeline WAHA; nesse caso a
-- restrição não entra e o histórico permanece intacto para conferência manual.
do $$
begin
  if exists (
    select 1 from public.conversion_leads
    where ctwa_clid is not null
    group by ctwa_clid having count(*) > 1
  ) then
    raise warning 'ctwa_clid duplicado no histórico: índice único não criado. Concilie os leads antigos.';
  else
    create unique index if not exists conversion_leads_ctwa_clid_key
      on public.conversion_leads (ctwa_clid) where ctwa_clid is not null;
  end if;
end
$$;

-- Leads antigos que já tinham identificador de clique vieram de anúncio.
--
-- A migração roda como dono do banco, sem sessão de usuário. O gatilho de
-- escrita de conversion_leads recusa qualquer gravação que não venha de um
-- usuário autenticado ou do papel de serviço — é ele que impede um cliente de
-- reescrever a procedência de um lead. Para o backfill, a própria migração se
-- identifica como serviço, e só pelo tempo desta transação: `set_config` com
-- is_local = true reverte sozinho ao fim do bloco.
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  update public.conversion_leads
  set origem = case when ctwa_clid is not null then 'anuncio' else 'desconhecida' end
  where origem = 'desconhecida';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Guarda de escrita do cliente. Mantém o que já existia e acrescenta as
--    colunas de procedência oficial — que o cliente nunca pode reescrever,
--    porque são elas que ligam o lead ao anúncio e ao tenant.
--    "Desqualificado" sai do produto: nenhuma etapa nova pode cair nele, mas
--    as linhas históricas continuam existindo e podem sair de lá.
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

  -- A etapa saiu do funil. Reclassificar para trás continua permitido.
  if new.qualificacao = 'desqualificado'
     and new.qualificacao is distinct from old.qualificacao
  then
    raise exception 'A etapa Desqualificado foi removida do funil.'
      using errcode = '22023';
  end if;

  -- O valor pago é opcional e pode ser registrado depois que o cartão já está
  -- em "Veículos comprados". Por isso a permissão acompanha a etapa atual, não
  -- só o instante da mudança.
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

  -- O valor pago é custo de aquisição e fica no CRM. Ele não é exigido para
  -- mover o cartão, não é receita e nunca é enviado à Meta.
  if new.qualificacao = 'fechado' and new.valor is not null then
    if new.valor <= 0 then
      raise exception 'O valor pago, quando informado, precisa ser maior que zero.'
        using errcode = '22023';
    end if;

    new.moeda := upper(btrim(coalesce(new.moeda, 'BRL')));
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
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

revoke all on function private.guard_conversion_lead_update() from public, anon, authenticated;

-- O fechamento deixa de exigir valor: quem move o cartão registra o resultado
-- comercial, não uma receita.
create or replace function private.capture_conversion_events()
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
    perform private.enqueue_conversion_event(new, 'VehicleAcquired', coalesce(new.qualificado_em, now()));
  end if;

  -- Uma correção antes do worker reservar o evento cancela aquele marco.
  -- Avançar preserva os eventos anteriores mesmo com a fila parada.
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

-- ---------------------------------------------------------------------------
-- 5. Onboarding oficial. Chamado apenas pelo servidor da aplicação, que já
--    autenticou o usuário e trocou o código por token fora do navegador.
-- ---------------------------------------------------------------------------

create or replace function public.meta_save_whatsapp_connection(
  p_client_id uuid,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone_number text default null,
  p_verified_name text default null,
  p_business_id text default null,
  p_dataset_id text default null,
  p_is_on_biz_app boolean default null,
  p_platform_type text default null,
  p_webhook_subscribed boolean default false,
  p_status public.wa_connection_status default 'whatsapp_connected',
  p_access_token text default null,
  p_token_scopes text default null,
  p_last_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict uuid;
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_waba_id), '') !~ '^[0-9]{5,30}$'
     or nullif(btrim(p_phone_number_id), '') !~ '^[0-9]{5,30}$'
  then
    raise exception 'WABA e número oficial são obrigatórios.' using errcode = '22023';
  end if;

  if nullif(btrim(p_dataset_id), '') is not null
     and btrim(p_dataset_id) !~ '^[0-9]{5,30}$'
  then
    raise exception 'Dataset inválido.' using errcode = '22023';
  end if;

  -- Um WABA/número/Dataset pertence a um cliente só. Recusar aqui impede que um
  -- onboarding equivocado passe a direcionar leads para o tenant errado.
  select connection.client_id into v_conflict
  from public.client_whatsapp_connections as connection
  where connection.client_id <> p_client_id
    and (connection.waba_id = btrim(p_waba_id)
      or connection.phone_number_id = btrim(p_phone_number_id)
      or (nullif(btrim(p_dataset_id), '') is not null
          and connection.dataset_id = btrim(p_dataset_id)))
  limit 1;

  if v_conflict is not null then
    raise exception 'Este WhatsApp já está conectado a outro cliente.'
      using errcode = '23505';
  end if;

  insert into public.client_whatsapp_connections as connection (
    client_id, waba_id, phone_number_id, display_phone_number, verified_name,
    business_id, dataset_id, is_on_biz_app, platform_type, webhook_subscribed,
    status, last_error, connected_at
  ) values (
    p_client_id, btrim(p_waba_id), btrim(p_phone_number_id),
    nullif(btrim(p_display_phone_number), ''), nullif(btrim(p_verified_name), ''),
    nullif(btrim(p_business_id), ''), nullif(btrim(p_dataset_id), ''),
    p_is_on_biz_app, nullif(btrim(p_platform_type), ''), coalesce(p_webhook_subscribed, false),
    p_status, nullif(btrim(p_last_error), ''), now()
  )
  on conflict (client_id) do update set
    waba_id = excluded.waba_id,
    phone_number_id = excluded.phone_number_id,
    display_phone_number = coalesce(excluded.display_phone_number, connection.display_phone_number),
    verified_name = coalesce(excluded.verified_name, connection.verified_name),
    business_id = coalesce(excluded.business_id, connection.business_id),
    -- Reconectar nunca descarta o Dataset já resolvido para este cliente.
    dataset_id = coalesce(excluded.dataset_id, connection.dataset_id),
    is_on_biz_app = coalesce(excluded.is_on_biz_app, connection.is_on_biz_app),
    platform_type = coalesce(excluded.platform_type, connection.platform_type),
    webhook_subscribed = excluded.webhook_subscribed,
    status = excluded.status,
    last_error = excluded.last_error,
    connected_at = coalesce(connection.connected_at, excluded.connected_at),
    disconnected_at = null,
    atualizado_em = now();

  if nullif(btrim(p_access_token), '') is not null then
    insert into private.client_whatsapp_credentials (client_id, access_token, token_scopes)
    values (p_client_id, btrim(p_access_token), nullif(btrim(p_token_scopes), ''))
    on conflict (client_id) do update
      set access_token = excluded.access_token,
          token_scopes = coalesce(
            excluded.token_scopes,
            private.client_whatsapp_credentials.token_scopes
          ),
          atualizado_em = now();
  end if;

  -- Espelha os identificadores públicos onde o restante do sistema já os lê.
  update public.clients
  set meta_waba_id = btrim(p_waba_id),
      meta_dataset_id = coalesce(
        nullif(btrim(p_dataset_id), ''),
        (select connection.dataset_id
           from public.client_whatsapp_connections as connection
          where connection.client_id = p_client_id)
      ),
      capi_ativo = (p_status = 'active')
  where id = p_client_id;
end;
$$;

revoke all on function public.meta_save_whatsapp_connection(
  uuid, text, text, text, text, text, text, boolean, text, boolean,
  public.wa_connection_status, text, text, text
) from public, anon, authenticated;
grant execute on function public.meta_save_whatsapp_connection(
  uuid, text, text, text, text, text, text, boolean, text, boolean,
  public.wa_connection_status, text, text, text
) to service_role;

create or replace function public.meta_set_connection_status(
  p_client_id uuid,
  p_status public.wa_connection_status,
  p_last_error text default null
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

  insert into public.client_whatsapp_connections (client_id, status, last_error)
  values (p_client_id, p_status, nullif(btrim(p_last_error), ''))
  on conflict (client_id) do update
    set status = excluded.status,
        last_error = excluded.last_error,
        atualizado_em = now();

  update public.clients set capi_ativo = (p_status = 'active') where id = p_client_id;
end;
$$;

revoke all on function public.meta_set_connection_status(uuid, public.wa_connection_status, text)
  from public, anon, authenticated;
grant execute on function public.meta_set_connection_status(uuid, public.wa_connection_status, text)
  to service_role;

-- Desconectar apaga a credencial e para a fila, sem destruir leads nem o
-- histórico de conversões: reconectar reaproveita o mesmo Dataset.
create or replace function public.meta_disconnect_whatsapp(p_client_id uuid)
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

  delete from private.client_whatsapp_credentials where client_id = p_client_id;

  update public.client_whatsapp_connections
  set status = 'disconnected',
      webhook_subscribed = false,
      disconnected_at = now(),
      last_error = null,
      atualizado_em = now()
  where client_id = p_client_id;

  update public.clients set capi_ativo = false where id = p_client_id;
end;
$$;

revoke all on function public.meta_disconnect_whatsapp(uuid) from public, anon, authenticated;
grant execute on function public.meta_disconnect_whatsapp(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Webhook oficial. O tenant vem SEMPRE do phone_number_id/waba_id
--    cadastrados, nunca de um client_id recebido no corpo da requisição.
-- ---------------------------------------------------------------------------

create or replace function public.meta_ingest_ad_lead(
  p_phone_number_id text,
  p_waba_id text,
  p_wa_message_id text,
  p_telefone text,
  p_ctwa_clid text,
  p_nome text default null,
  p_ad_source_id text default null,
  p_ad_source_url text default null,
  p_ad_source_type text default null,
  p_event_time timestamptz default null
)
returns table (lead_id uuid, novo boolean, client_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_id uuid;
  v_phone text;
  v_click text := nullif(btrim(p_ctwa_clid), '');
  v_message text := nullif(btrim(p_wa_message_id), '');
  v_when timestamptz := coalesce(p_event_time, now());
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select connection.client_id into v_client
  from public.client_whatsapp_connections as connection
  where connection.phone_number_id = nullif(btrim(p_phone_number_id), '')
    and connection.status <> 'disconnected';

  -- O número é o identificador primário; o WABA é a segunda chance quando a
  -- Meta entrega um evento cujo número ainda não foi visto.
  if v_client is null then
    select connection.client_id into v_client
    from public.client_whatsapp_connections as connection
    where connection.waba_id = nullif(btrim(p_waba_id), '')
      and connection.status <> 'disconnected';
  end if;

  if v_client is null then
    return;
  end if;

  update public.client_whatsapp_connections
  set last_webhook_at = now(), atualizado_em = now()
  where client_whatsapp_connections.client_id = v_client;

  -- A Meta acabou de provar que entrega para este cliente. Só agora o fluxo
  -- antigo pode ser desligado para ele, sem janela sem captação.
  perform private.promote_client_to_official(v_client);

  -- Sem prova de origem em anúncio não existe conversão a registrar. Uma
  -- mensagem orgânica não pode entrar no funil como se viesse da Meta.
  if v_click is null then
    return;
  end if;

  v_phone := nullif(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), '');
  if v_phone is null then
    return;
  end if;

  -- Idempotência: a mesma entrega repetida não cria um segundo lead.
  if v_message is not null then
    select lead.id into v_id from public.conversion_leads as lead
    where lead.wa_message_id = v_message;
    if v_id is not null then
      return query select v_id, false, v_client;
      return;
    end if;
  end if;

  select lead.id into v_id from public.conversion_leads as lead
  where lead.ctwa_clid = v_click;

  if v_id is not null then
    -- O vínculo original com o anúncio nunca é sobrescrito; só completamos o
    -- que faltava. ctwa_clid, ad_source_id e a data de entrada ficam intactos.
    update public.conversion_leads as lead
    set nome = coalesce(lead.nome, nullif(btrim(p_nome), '')),
        wa_message_id = coalesce(lead.wa_message_id, v_message),
        phone_number_id = coalesce(lead.phone_number_id, nullif(btrim(p_phone_number_id), '')),
        waba_id = coalesce(lead.waba_id, nullif(btrim(p_waba_id), '')),
        ad_source_id = coalesce(lead.ad_source_id, nullif(btrim(p_ad_source_id), '')),
        ad_source_url = coalesce(lead.ad_source_url, nullif(btrim(p_ad_source_url), '')),
        ad_source_type = coalesce(lead.ad_source_type, nullif(btrim(p_ad_source_type), '')),
        origem = 'anuncio',
        atualizado_em = now()
    where lead.id = v_id;

    return query select v_id, false, v_client;
    return;
  end if;

  insert into public.conversion_leads (
    client_id, telefone, nome, ctwa_clid, ad_source_id, ad_source_url,
    ad_source_type, ad_entry_point, wa_message_id, phone_number_id, waba_id,
    origem, capi_event_name, criado_em
  ) values (
    v_client, v_phone, nullif(btrim(p_nome), ''), v_click,
    nullif(btrim(p_ad_source_id), ''), nullif(btrim(p_ad_source_url), ''),
    nullif(btrim(p_ad_source_type), ''), 'click_to_whatsapp', v_message,
    nullif(btrim(p_phone_number_id), ''), nullif(btrim(p_waba_id), ''),
    'anuncio', 'LeadSubmitted', v_when
  )
  returning id into v_id;

  update public.client_whatsapp_connections
  set last_lead_at = now(), atualizado_em = now()
  where client_whatsapp_connections.client_id = v_client;

  return query select v_id, true, v_client;
end;
$$;

revoke all on function public.meta_ingest_ad_lead(
  text, text, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.meta_ingest_ad_lead(
  text, text, text, text, text, text, text, text, text, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Fila de envio. Mesma semântica de antes (reserva atômica, conciliação de
--    resposta ambígua, janela de 7 dias), agora consumida por um worker da
--    aplicação. O Dataset e o token vêm da conexão oficial; a configuração
--    manual antiga continua valendo enquanto um cliente não reconectar.
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
  credential_source text
)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  -- Reserva vencida é ambígua: a Meta pode ter recebido. A CAPI de mensagens
  -- não garante deduplicação, então exigimos conciliação em vez de reenviar.
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
    r.credential_source
  from claimed e join public.conversion_leads l on l.id = e.lead_id
  join resolved r on r.client_id = l.client_id
  order by e.event_time, e.event_id;
end;
$$;
revoke all on function public.capi_fetch_queue(integer) from public, anon, authenticated;
grant execute on function public.capi_fetch_queue(integer) to service_role;

-- Marca o resultado e registra a data da última conversão confirmada, que o
-- painel administrativo mostra por cliente.
create or replace function public.capi_mark_result(p_lead_id uuid, p_event_id text, p_ok boolean,
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
  -- Uma confirmação atrasada da qualificação não pode marcar a aquisição como enviada.
  update public.conversion_leads set capi_status = v_event.status,
    capi_enviado_em = v_event.sent_at, capi_resposta = v_event.response,
    capi_tentativas = v_event.attempts, capi_claimed_at = null,
    capi_next_attempt_at = v_event.next_attempt_at
  where id = p_lead_id and capi_event_id = p_event_id;

  if p_ok then
    update public.client_whatsapp_connections connection
    set last_conversion_at = now(), atualizado_em = now()
    from public.conversion_leads l
    where l.id = p_lead_id and connection.client_id = l.client_id;
  end if;
end;
$$;
revoke all on function public.capi_mark_result(uuid, text, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.capi_mark_result(uuid, text, boolean, text, boolean) to service_role;

create or replace function public.conversion_pipeline_version()
returns integer language sql stable security invoker set search_path = '' as $$ select 3; $$;
revoke all on function public.conversion_pipeline_version() from public, anon;
grant execute on function public.conversion_pipeline_version() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Diagnóstico do administrador. Mostra tudo menos o token.
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
  ingest_mode text
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
    c.conversion_ingest_mode
  from public.clients c
  left join public.client_whatsapp_connections connection on connection.client_id = c.id
  order by c.nome_empresa;
end;
$$;
revoke all on function public.admin_client_capi_status() from public, anon, authenticated;
grant execute on function public.admin_client_capi_status() to service_role;

-- O resumo perde a etapa removida, mas continua contando o histórico dela para
-- que um lead antigo nunca suma do total.
drop function if exists public.conversion_leads_summary(timestamptz, uuid);
create function public.conversion_leads_summary(
  p_start_date timestamptz default null,
  p_client_id uuid default null
)
returns table (total bigint, pending bigint, qualified bigint, discarded bigint, closed bigint)
language sql stable security invoker set search_path = '' as $$
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
revoke all on function public.conversion_leads_summary(timestamptz, uuid) from public, anon;
grant execute on function public.conversion_leads_summary(timestamptz, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Fase de compatibilidade. Esta migração é ADITIVA: nada é removido.
--
--    Durante a transição os dois caminhos de captação coexistem, um por
--    cliente. Quem ainda não conectou o WhatsApp oficial continua entrando
--    pelo WAHA/n8n exatamente como antes; quem já conectou entra pelo webhook
--    oficial da Meta.
--
--    Sem isso, apagar waha_ingest_lead aqui interromperia a captação de leads
--    de todos os clientes no instante em que a migração rodasse — e o fluxo
--    novo só produz lead depois que cada cliente conclui o Embedded Signup.
--
--    A remoção definitiva de WAHA/n8n em Conversões fica para uma SEGUNDA
--    migração, executada só quando todos os clientes estiverem em
--    official_meta. Nada aqui toca o WAHA do Atendimento por IA.
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists conversion_ingest_mode text not null default 'legacy_waha';

comment on column public.clients.conversion_ingest_mode is
  'De onde vêm os leads de Conversões deste cliente: legacy_waha (WAHA/n8n) ou official_meta (webhook oficial). Sem relação com o Atendimento por IA.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_conversion_ingest_mode_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_conversion_ingest_mode_check
      check (conversion_ingest_mode in ('legacy_waha', 'official_meta'));
  end if;
end
$$;

create index if not exists clients_conversion_ingest_mode_idx
  on public.clients (conversion_ingest_mode);

-- A integração oficial de um cliente está saudável quando ela consegue, de
-- fato, receber o lead e enviar a conversão: número e WABA conectados, Dataset
-- resolvido, webhook assinado e credencial guardada.
create or replace function private.official_integration_is_healthy(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_whatsapp_connections as connection
    join private.client_whatsapp_credentials as credential
      on credential.client_id = connection.client_id
    where connection.client_id = p_client_id
      and connection.status = 'active'
      and connection.waba_id is not null
      and connection.phone_number_id is not null
      and connection.dataset_id is not null
      and connection.webhook_subscribed
  );
$$;

revoke all on function private.official_integration_is_healthy(uuid)
  from public, anon, authenticated;

-- Promoção automática. Só acontece depois que o webhook oficial daquele
-- cliente realmente entregou alguma coisa: até a Meta provar que entrega, o
-- WAHA continua captando. É isso que torna a virada sem perda de leads.
create or replace function private.promote_client_to_official(p_client_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
begin
  if not private.official_integration_is_healthy(p_client_id) then
    return false;
  end if;

  update public.clients
  set conversion_ingest_mode = 'official_meta'
  where id = p_client_id
    and conversion_ingest_mode <> 'official_meta';

  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

revoke all on function private.promote_client_to_official(uuid)
  from public, anon, authenticated;

-- Controle manual do administrador: promover antes da primeira mensagem, ou
-- voltar um cliente ao fluxo antigo se algo der errado do lado da Meta.
create or replace function public.admin_set_conversion_ingest_mode(
  p_client_id uuid,
  p_mode text
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
     and not private.is_active_admin()
  then
    raise exception 'Apenas administradores podem alterar a origem dos leads.'
      using errcode = '42501';
  end if;

  if p_mode not in ('legacy_waha', 'official_meta') then
    raise exception 'Modo de captação inválido.' using errcode = '22023';
  end if;

  -- Migrar para o oficial sem a integração pronta deixaria o cliente sem
  -- captação nenhuma: o WAHA para e a Meta ainda não entrega.
  if p_mode = 'official_meta'
     and not private.official_integration_is_healthy(p_client_id)
  then
    raise exception 'A integração oficial deste cliente ainda não está completa.'
      using errcode = '22023';
  end if;

  update public.clients set conversion_ingest_mode = p_mode where id = p_client_id;

  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_conversion_ingest_mode(uuid, text)
  from public, anon;
grant execute on function public.admin_set_conversion_ingest_mode(uuid, text)
  to authenticated, service_role;

-- Ingestão antiga, preservada com a MESMA assinatura para que o workflow do
-- n8n continue funcionando sem nenhuma alteração. A única mudança de
-- comportamento: um cliente já migrado é ignorado, para que a mesma conversa
-- não entre duas vezes durante a fase híbrida.
--
-- Isto NÃO afeta o WAHA do Atendimento por IA: aquele fluxo usa outro webhook
-- e não passa por esta função.
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
  v_mode text;
  v_id uuid;
  v_phone text;
  v_click text := nullif(btrim(p_ctwa_clid), '');
  v_event text := nullif(btrim(p_event_id), '');
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  v_phone := nullif(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), '');

  if nullif(btrim(p_session_name), '') is null or v_phone is null then
    raise exception 'Sessão e telefone são obrigatórios.' using errcode = '22023';
  end if;

  select session.client_id into v_client
  from public.whatsapp_sessions as session
  where session.session_name = btrim(p_session_name);

  if v_client is null then
    raise exception 'Sessão não vinculada a nenhum cliente.' using errcode = '22023';
  end if;

  select client.conversion_ingest_mode into v_mode
  from public.clients as client
  where client.id = v_client;

  -- Cliente já migrado: as Conversões dele vêm do webhook oficial. Ignorar
  -- aqui é o que garante que um contato não seja criado duas vezes.
  if coalesce(v_mode, 'legacy_waha') = 'official_meta' then
    return;
  end if;

  -- Deduplicação entre os dois pipelines. O message id não cruza (o do WAHA
  -- não é o wamid da Cloud API), então a chave comum é o ctwa_clid.
  if v_event is not null then
    select lead.id into v_id from public.conversion_leads as lead
    where lead.waha_event_id = v_event;

    if v_id is not null then
      return query select v_id, false;
      return;
    end if;
  end if;

  if v_click is not null then
    select lead.id into v_id from public.conversion_leads as lead
    where lead.ctwa_clid = v_click;

    if v_id is not null then
      -- Pode já ter entrado pelo caminho oficial. Completa o que falta sem
      -- tocar no vínculo original com o anúncio.
      update public.conversion_leads as lead
      set nome = coalesce(lead.nome, nullif(btrim(p_nome), '')),
          waha_event_id = coalesce(lead.waha_event_id, v_event),
          atualizado_em = now()
      where lead.id = v_id;

      return query select v_id, false;
      return;
    end if;
  end if;

  -- Rede de segurança quando nenhum dos lados trouxe identificador de clique:
  -- o mesmo telefone, no mesmo cliente, dentro de 24 horas.
  select lead.id into v_id
  from public.conversion_leads as lead
  where lead.client_id = v_client
    and lead.telefone = v_phone
    and lead.criado_em > now() - interval '24 hours'
  order by lead.criado_em desc
  limit 1;

  if v_id is not null then
    update public.conversion_leads as lead
    set ctwa_clid = coalesce(lead.ctwa_clid, v_click),
        ad_source_id = coalesce(lead.ad_source_id, nullif(btrim(p_ad_source_id), '')),
        ad_entry_point = coalesce(lead.ad_entry_point, nullif(btrim(p_ad_entry_point), '')),
        nome = coalesce(lead.nome, nullif(btrim(p_nome), '')),
        waha_event_id = coalesce(lead.waha_event_id, v_event),
        origem = case
          when coalesce(lead.ctwa_clid, v_click) is not null then 'anuncio'
          else lead.origem
        end,
        atualizado_em = now()
    where lead.id = v_id;

    return query select v_id, false;
    return;
  end if;

  insert into public.conversion_leads (
    client_id, telefone, nome, ctwa_clid, ad_source_id, ad_entry_point,
    waha_event_id, origem, capi_event_name
  ) values (
    v_client, v_phone, nullif(btrim(p_nome), ''), v_click,
    nullif(btrim(p_ad_source_id), ''), nullif(btrim(p_ad_entry_point), ''),
    v_event,
    case when v_click is not null then 'anuncio' else 'organico' end,
    'LeadSubmitted'
  )
  returning id into v_id;

  return query select v_id, true;
end;
$$;

revoke all on function public.waha_ingest_lead(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.waha_ingest_lead(text, text, text, text, text, text, text)
  to service_role;
