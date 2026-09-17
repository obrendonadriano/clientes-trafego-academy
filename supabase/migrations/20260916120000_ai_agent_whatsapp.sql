-- Atendimento e qualificação automática de leads por IA no WhatsApp.
--
-- Reaproveita a sessão WAHA que o cliente já conecta em public.whatsapp_sessions:
-- nenhuma credencial nova de WhatsApp é criada aqui. O acesso ao recurso é
-- decidido por public.clients.plan_type e o bloqueio é imposto por TRIGGER,
-- não só pela aplicação — um Essencial não liga a IA nem chamando a API direto.

-- ---------------------------------------------------------------------------
-- Helper de admin: já existe no banco de produção (pipeline CAPI). Em bancos
-- novos/locais ele ainda não existe, então criamos apenas se faltar — nunca
-- sobrescrevemos a definição que já estiver valendo.
-- ---------------------------------------------------------------------------
create schema if not exists private;

do $$
begin
  if not exists (
    select 1
    from pg_proc as proc
    join pg_namespace as ns on ns.oid = proc.pronamespace
    where ns.nspname = 'private'
      and proc.proname = 'is_active_admin'
  ) then
    execute $fn$
      create function private.is_active_admin()
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select exists (
          select 1
          from public.users as app_user
          where app_user.auth_user_id = (select auth.uid())
            and app_user.role = 'admin'
            and app_user.ativo
        );
      $body$;
    $fn$;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type
    where typname = 'client_plan_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.client_plan_type as enum ('essential', 'complete');
  end if;

  if not exists (
    select 1 from pg_type
    where typname = 'ai_lead_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.ai_lead_status as enum (
      'new',
      'qualifying',
      'qualified',
      'disqualified',
      'human_takeover',
      'completed',
      'error'
    );
  end if;

  if not exists (
    select 1 from pg_type
    where typname = 'ai_message_direction'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.ai_message_direction as enum ('inbound', 'outbound');
  end if;

  if not exists (
    select 1 from pg_type
    where typname = 'ai_message_status'
      and typnamespace = 'public'::regnamespace
  ) then
    -- inbound: received -> processed | ignored
    -- outbound: queued -> typing -> sent | failed
    create type public.ai_message_status as enum (
      'received',
      'processed',
      'ignored',
      'queued',
      'typing',
      'sent',
      'failed'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Plano do cliente
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists plan_type public.client_plan_type not null default 'essential';

comment on column public.clients.plan_type is
  'Plano contratado. Somente "complete" libera o atendimento por IA.';

-- ---------------------------------------------------------------------------
-- Configuração da IA por cliente (uma linha por cliente)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_agent_settings (
  client_id uuid primary key references public.clients(id) on delete cascade,
  enabled boolean not null default false,
  prompt text not null default '',
  notification_whatsapp text,
  always_on boolean not null default true,
  typing_enabled boolean not null default true,
  notify_qualified boolean not null default true,
  delay_min_ms integer not null default 2000,
  delay_max_ms integer not null default 5000,
  message_gap_min_ms integer not null default 1000,
  message_gap_max_ms integer not null default 3000,
  debounce_ms integer not null default 3000,
  timezone text not null default 'America/Sao_Paulo',
  -- Guarda quando um downgrade desligou a IA, para explicar na tela.
  disabled_by_plan_at timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_agent_settings_delays_check'
      and conrelid = 'public.ai_agent_settings'::regclass
  ) then
    alter table public.ai_agent_settings
      add constraint ai_agent_settings_delays_check check (
        delay_min_ms between 0 and 60000
        and delay_max_ms between 0 and 60000
        and delay_max_ms >= delay_min_ms
        and message_gap_min_ms between 0 and 60000
        and message_gap_max_ms between 0 and 60000
        and message_gap_max_ms >= message_gap_min_ms
        and debounce_ms between 0 and 60000
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_agent_settings_notification_check'
      and conrelid = 'public.ai_agent_settings'::regclass
  ) then
    -- Só aceita telefone brasileiro já normalizado (55 + DDD + 8 ou 9 dígitos).
    alter table public.ai_agent_settings
      add constraint ai_agent_settings_notification_check check (
        notification_whatsapp is null
        or notification_whatsapp ~ '^55[1-9][1-9][0-9]{8,9}$'
      );
  end if;
end
$$;

comment on table public.ai_agent_settings is
  'Configuração do atendimento por IA. Preservada mesmo em downgrade de plano.';

-- ---------------------------------------------------------------------------
-- Conversas (uma por lead/número dentro de cada cliente)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Somente dígitos, sempre com DDI 55 na frente.
  whatsapp_number text not null,
  -- chatId cru do WAHA (ex.: 5514999999999@c.us), usado para responder.
  chat_id text not null,
  name text,
  status public.ai_lead_status not null default 'new',
  -- Campos do nicho inicial (compra de veículos financiados). Campos de outros
  -- nichos entram em extra_data sem exigir migração.
  vehicle text,
  vehicle_year integer,
  financed boolean,
  bank text,
  debt_amount numeric(12,2),
  has_overdue_installments boolean,
  overdue_installments_count integer,
  -- Diferencia "o lead disse que não sabe" de "ainda não perguntamos".
  unknown_fields text[] not null default '{}',
  extra_data jsonb not null default '{}'::jsonb,
  disqualification_reason text,
  qualified_at timestamptz,
  notification_sent boolean not null default false,
  notification_sent_at timestamptz,
  human_takeover boolean not null default false,
  human_takeover_requested boolean not null default false,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  -- Lease de processamento: impede duas execuções simultâneas na mesma conversa.
  processing_claimed_at timestamptz,
  last_error text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists ai_conversations_client_number_key
  on public.ai_conversations (client_id, whatsapp_number);

create index if not exists ai_conversations_client_status_idx
  on public.ai_conversations (client_id, status, criado_em desc);

create index if not exists ai_conversations_client_recent_idx
  on public.ai_conversations (client_id, atualizado_em desc);

-- ---------------------------------------------------------------------------
-- Mensagens (histórico completo, persistido — não depende de memória do app)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  direction public.ai_message_direction not null,
  status public.ai_message_status not null default 'received',
  body text not null,
  -- id do evento/mensagem no WAHA: garante idempotência do webhook.
  provider_message_id text,
  -- Agrupa as partes de uma mesma resposta da IA.
  run_id uuid,
  sequence integer not null default 0,
  delay_ms integer not null default 0,
  -- Momento em que o "digitando..." começou. É o relógio do envio: garante
  -- que o delay seja respeitado mesmo se o webhook disparar dois fluxos.
  typing_started_at timestamptz,
  sent_at timestamptz,
  criado_em timestamptz not null default now()
);

create unique index if not exists ai_messages_provider_message_id_key
  on public.ai_messages (provider_message_id)
  where provider_message_id is not null;

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, criado_em);

create index if not exists ai_messages_pending_outbound_idx
  on public.ai_messages (conversation_id, sequence)
  where direction = 'outbound' and status in ('queued', 'typing');

create index if not exists ai_messages_unprocessed_inbound_idx
  on public.ai_messages (conversation_id, criado_em)
  where direction = 'inbound' and status = 'received';

-- ---------------------------------------------------------------------------
-- atualizado_em automático
-- ---------------------------------------------------------------------------
create or replace function private.touch_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists ai_agent_settings_touch on public.ai_agent_settings;
create trigger ai_agent_settings_touch
  before update on public.ai_agent_settings
  for each row execute function private.touch_atualizado_em();

drop trigger if exists ai_conversations_touch on public.ai_conversations;
create trigger ai_conversations_touch
  before update on public.ai_conversations
  for each row execute function private.touch_atualizado_em();

-- ---------------------------------------------------------------------------
-- Barreira de plano no próprio banco.
--
-- Esta é a trava que o item "o bloqueio não pode ser apenas visual" exige:
-- mesmo com service_role, mesmo alterando o front, mesmo chamando a API do
-- PostgREST na mão, enabled = true só passa com plano Completo.
-- ---------------------------------------------------------------------------
create or replace function private.ai_agent_requires_complete_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.client_plan_type;
begin
  if not new.enabled then
    return new;
  end if;

  select client.plan_type into v_plan
  from public.clients as client
  where client.id = new.client_id;

  if v_plan is distinct from 'complete' then
    raise exception 'O atendimento por IA é exclusivo do Plano Completo.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists ai_agent_settings_plan_guard on public.ai_agent_settings;
create trigger ai_agent_settings_plan_guard
  before insert or update on public.ai_agent_settings
  for each row execute function private.ai_agent_requires_complete_plan();

-- Downgrade desliga a IA na hora, mas preserva prompt, número e histórico.
create or replace function private.ai_agent_apply_plan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan_type = 'essential' and old.plan_type is distinct from new.plan_type then
    update public.ai_agent_settings as settings
    set enabled = false,
        disabled_by_plan_at = now()
    where settings.client_id = new.id
      and settings.enabled;
  end if;

  return new;
end;
$$;

drop trigger if exists clients_plan_change_disables_ai on public.clients;
create trigger clients_plan_change_disables_ai
  after update of plan_type on public.clients
  for each row execute function private.ai_agent_apply_plan_change();

-- ---------------------------------------------------------------------------
-- RLS: leitura escopada ao próprio cliente; escrita só por admin/service_role.
--
-- As policies NÃO chamam private.is_active_admin(): a migração da CAPI revoga
-- o schema `private` de `authenticated`, e uma policy é avaliada com as
-- permissões de quem consulta. O teste de admin vai inline, lendo a própria
-- linha do usuário (que a policy "clients can read own user row" já libera).
-- ---------------------------------------------------------------------------
alter table public.ai_agent_settings enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "admin manages ai agent settings" on public.ai_agent_settings;
create policy "admin manages ai agent settings"
on public.ai_agent_settings
for all
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.role = 'admin'
  )
);

drop policy if exists "client reads own ai agent settings" on public.ai_agent_settings;
create policy "client reads own ai agent settings"
on public.ai_agent_settings
for select
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.client_id = ai_agent_settings.client_id
  )
);

drop policy if exists "admin manages ai conversations" on public.ai_conversations;
create policy "admin manages ai conversations"
on public.ai_conversations
for all
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.role = 'admin'
  )
);

drop policy if exists "client reads own ai conversations" on public.ai_conversations;
create policy "client reads own ai conversations"
on public.ai_conversations
for select
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.client_id = ai_conversations.client_id
  )
);

drop policy if exists "admin manages ai messages" on public.ai_messages;
create policy "admin manages ai messages"
on public.ai_messages
for all
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.role = 'admin'
  )
);

drop policy if exists "client reads own ai messages" on public.ai_messages;
create policy "client reads own ai messages"
on public.ai_messages
for select
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.client_id = ai_messages.client_id
  )
);

-- ---------------------------------------------------------------------------
-- Grants de menor privilégio
-- ---------------------------------------------------------------------------
revoke all on table public.ai_agent_settings from anon, authenticated;
revoke all on table public.ai_conversations from anon, authenticated;
revoke all on table public.ai_messages from anon, authenticated;

grant select on table public.ai_agent_settings to authenticated;
grant select on table public.ai_conversations to authenticated;
grant select on table public.ai_messages to authenticated;

grant all on table public.ai_agent_settings to service_role;
grant all on table public.ai_conversations to service_role;
grant all on table public.ai_messages to service_role;

-- ---------------------------------------------------------------------------
-- Reserva atômica da conversa. Impede que duas entregas do webhook processem
-- a mesma conversa ao mesmo tempo; uma reserva abandonada expira em 3 minutos.
-- ---------------------------------------------------------------------------
create or replace function public.ai_claim_conversation(
  p_conversation_id uuid,
  p_stale_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  update public.ai_conversations as conversation
  set processing_claimed_at = now()
  where conversation.id = p_conversation_id
    and (
      conversation.processing_claimed_at is null
      or conversation.processing_claimed_at
         < now() - make_interval(secs => greatest(30, p_stale_seconds))
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.ai_claim_conversation(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.ai_claim_conversation(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Visão administrativa (cliente, plano, IA, WhatsApp, volume de leads).
-- ---------------------------------------------------------------------------
create or replace function public.admin_ai_agent_overview()
returns table(
  client_id uuid,
  nome_empresa text,
  plan_type public.client_plan_type,
  ai_enabled boolean,
  notification_whatsapp text,
  whatsapp_status text,
  whatsapp_phone text,
  total_conversations bigint,
  qualified_conversations bigint
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
         client.plan_type,
         coalesce(settings.enabled, false),
         settings.notification_whatsapp,
         session.status,
         session.phone_number,
         coalesce(stats.total, 0),
         coalesce(stats.qualified, 0)
  from public.clients as client
  left join public.ai_agent_settings as settings
    on settings.client_id = client.id
  left join public.whatsapp_sessions as session
    on session.client_id = client.id
  left join lateral (
    select count(*) as total,
           count(*) filter (where conversation.status = 'qualified') as qualified
    from public.ai_conversations as conversation
    where conversation.client_id = client.id
  ) as stats on true
  order by client.nome_empresa;
end;
$$;

revoke all on function public.admin_ai_agent_overview() from public, anon;
grant execute on function public.admin_ai_agent_overview() to authenticated, service_role;
