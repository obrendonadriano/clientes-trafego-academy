-- Vinculo automatico entre clientes e campanhas pelo codigo de quatro digitos
-- no inicio do nome da campanha (ex.: "1123 - Campanha - ...").
--
-- Regras importantes:
--   * codigos ficam reservados para sempre, inclusive depois de excluir cliente;
--   * permissoes manuais continuam separadas em user_campaign_permissions;
--   * uma campanha vinculada automaticamente nunca troca de cliente em silencio;
--   * o backfill usa somente clientes com um unico codigo inequivoco nas
--     campanhas que ja estavam liberadas para eles.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.client_campaign_codes (
  code text primary key,
  client_id uuid unique references public.clients(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint client_campaign_codes_format_check
    check (code ~ '^[0-9]{4}$'),
  constraint client_campaign_codes_status_check
    check (status in ('active', 'retired')),
  constraint client_campaign_codes_active_owner_check
    check (status <> 'active' or client_id is not null)
);

create index if not exists client_campaign_codes_client_idx
  on public.client_campaign_codes (client_id)
  where client_id is not null;

alter table public.client_campaign_codes enable row level security;

-- A tabela e consultada diretamente apenas pelo backend privilegiado. O admin
-- autenticado pode le-la por RLS; clientes nao enxergam codigos de terceiros.
revoke all on table public.client_campaign_codes from anon, authenticated;
grant select on table public.client_campaign_codes to authenticated, service_role;
grant insert, update, delete on table public.client_campaign_codes to service_role;

drop policy if exists "admin reads client campaign codes"
  on public.client_campaign_codes;
create policy "admin reads client campaign codes"
on public.client_campaign_codes
for select
to authenticated
using ((select public.is_app_admin()));

alter table public.campaigns
  add column if not exists detected_client_code text
    generated always as (
      substring(nome from '^\s*([0-9]{4})\s*[-–—]')
    ) stored,
  add column if not exists client_assignment_source text
    not null default 'unassigned';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaigns_client_assignment_source_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_client_assignment_source_check
      check (client_assignment_source in ('unassigned', 'manual', 'code', 'conflict'));
  end if;
end
$$;

-- Todo vinculo anterior a esta automacao e considerado manual e, por isso,
-- nunca sera sobrescrito pelo codigo do nome.
update public.campaigns
set client_assignment_source = case
  when client_id is null then 'unassigned'
  else 'manual'
end;

create index if not exists campaigns_detected_client_code_idx
  on public.campaigns (detected_client_code)
  where detected_client_code is not null;

create index if not exists users_client_id_idx
  on public.users (client_id)
  where client_id is not null;

-- Reserva um codigo ainda nao usado por outro cliente nem presente em nenhuma
-- campanha antiga. O advisory lock evita duas criacoes concorrentes escolherem
-- o mesmo numero.
create or replace function private.allocate_client_campaign_code(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocated_code text;
begin
  if not exists (
    select 1 from public.clients where id = p_client_id
  ) then
    raise exception 'Cliente % nao encontrado para gerar codigo.', p_client_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('trafegoacademy:client-campaign-code', 0)
  );

  select registry.code
  into allocated_code
  from public.client_campaign_codes as registry
  where registry.client_id = p_client_id
    and registry.status = 'active'
  limit 1;

  if allocated_code is not null then
    return allocated_code;
  end if;

  select candidate::text
  into allocated_code
  from generate_series(1000, 9999) as candidate
  where not exists (
      select 1
      from public.client_campaign_codes as registry
      where registry.code = candidate::text
    )
    and not exists (
      select 1
      from public.campaigns as campaign
      where campaign.detected_client_code = candidate::text
    )
  order by random()
  limit 1;

  if allocated_code is null then
    raise exception 'Nao ha codigos de campanha disponiveis entre 1000 e 9999.';
  end if;

  insert into public.client_campaign_codes (code, client_id, status)
  values (allocated_code, p_client_id, 'active');

  return allocated_code;
end;
$$;

revoke all on function private.allocate_client_campaign_code(uuid)
  from public, anon, authenticated;

create or replace function private.allocate_code_after_client_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.allocate_client_campaign_code(new.id);
  return new;
end;
$$;

revoke all on function private.allocate_code_after_client_insert()
  from public, anon, authenticated;

drop trigger if exists allocate_campaign_code_after_client_insert
  on public.clients;
create trigger allocate_campaign_code_after_client_insert
after insert on public.clients
for each row
execute function private.allocate_code_after_client_insert();

create or replace function private.retire_code_before_client_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.client_campaign_codes
  set
    client_id = null,
    status = 'retired',
    retired_at = now()
  where client_id = old.id;

  return old;
end;
$$;

revoke all on function private.retire_code_before_client_delete()
  from public, anon, authenticated;

drop trigger if exists retire_campaign_code_before_client_delete
  on public.clients;
create trigger retire_campaign_code_before_client_delete
before delete on public.clients
for each row
execute function private.retire_code_before_client_delete();

-- O trigger roda tambem quando a Meta atualiza o nome. Vinculos manuais sao
-- preservados. Se uma campanha automatica mudar para outro codigo (ou perder o
-- codigo), mantemos o cliente anterior e marcamos conflito para revisao.
create or replace function private.reconcile_campaign_client_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_client_id uuid;
begin
  select registry.client_id
  into matched_client_id
  from public.client_campaign_codes as registry
  where registry.code = new.detected_client_code
    and registry.status = 'active'
    and registry.client_id is not null
  limit 1;

  if new.client_assignment_source = 'manual' and new.client_id is not null then
    return new;
  end if;

  if new.client_id is not null
    and new.client_assignment_source in ('code', 'conflict') then
    update public.campaigns
    set client_assignment_source = case
      when matched_client_id = new.client_id then 'code'
      else 'conflict'
    end
    where id = new.id
      and client_assignment_source is distinct from case
        when matched_client_id = new.client_id then 'code'
        else 'conflict'
      end;

    return new;
  end if;

  if matched_client_id is not null then
    update public.campaigns
    set
      client_id = matched_client_id,
      client_assignment_source = 'code'
    where id = new.id;
  elsif new.client_id is null
    and new.client_assignment_source <> 'unassigned' then
    update public.campaigns
    set client_assignment_source = 'unassigned'
    where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.reconcile_campaign_client_code()
  from public, anon, authenticated;

drop trigger if exists reconcile_campaign_client_code_after_name_change
  on public.campaigns;
create trigger reconcile_campaign_client_code_after_name_change
after insert or update of nome on public.campaigns
for each row
execute function private.reconcile_campaign_client_code();

-- Backfill seguro: considera tanto campanhas ja associadas diretamente ao
-- cliente quanto campanhas liberadas manualmente para o usuario dele. Somente
-- clientes com um unico codigo distinto e codigos pertencentes a um unico
-- cliente sao preenchidos automaticamente.
with candidate_pairs as (
  select distinct
    app_user.client_id,
    campaign.detected_client_code as code
  from public.user_campaign_permissions as permission
  join public.users as app_user on app_user.id = permission.user_id
  join public.clients as client on client.id = app_user.client_id
  join public.campaigns as campaign on campaign.id = permission.campaign_id
  where app_user.role = 'client'::public.app_role
    and app_user.client_id is not null
    and campaign.detected_client_code is not null

  union

  select distinct
    campaign.client_id,
    campaign.detected_client_code as code
  from public.campaigns as campaign
  where campaign.client_id is not null
    and campaign.detected_client_code is not null
),
one_code_per_client as (
  select
    client_id,
    min(code) as code
  from candidate_pairs
  group by client_id
  having count(distinct code) = 1
),
unambiguous_codes as (
  select
    client_id,
    code
  from one_code_per_client as candidate
  where (
    select count(*)
    from one_code_per_client as other
    where other.code = candidate.code
  ) = 1
)
insert into public.client_campaign_codes (code, client_id, status)
select code, client_id, 'active'
from unambiguous_codes
on conflict do nothing;

-- Todo cliente existente termina a migracao com um codigo. Casos ambiguos
-- recebem um numero novo que nao colide com nenhum prefixo ja usado na Meta.
do $$
declare
  client_record record;
begin
  for client_record in
    select client.id
    from public.clients as client
    where not exists (
      select 1
      from public.client_campaign_codes as registry
      where registry.client_id = client.id
        and registry.status = 'active'
    )
    order by client.created_at, client.id
  loop
    perform private.allocate_client_campaign_code(client_record.id);
  end loop;
end
$$;

-- Reprocessa imediatamente as campanhas ja importadas. Nao espera a proxima
-- sincronizacao da Meta e nao mexe em vinculos manuais existentes.
update public.campaigns as campaign
set
  client_id = registry.client_id,
  client_assignment_source = 'code'
from public.client_campaign_codes as registry
where campaign.client_id is null
  and campaign.detected_client_code = registry.code
  and registry.status = 'active'
  and registry.client_id is not null;

-- Cliente pode ver a uniao: campanhas automaticas do seu client_id mais as
-- permissoes extras escolhidas manualmente pelo administrador.
drop policy if exists "client sees allowed campaigns" on public.campaigns;
create policy "client sees allowed campaigns"
on public.campaigns
for select
to authenticated
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and (
        (
          app_user.client_id is not null
          and app_user.client_id = campaigns.client_id
        )
        or exists (
          select 1
          from public.user_campaign_permissions as permission
          where permission.user_id = app_user.id
            and permission.campaign_id = campaigns.id
        )
      )
  )
);

drop policy if exists "client sees metrics from allowed campaigns"
  on public.campaign_metrics;
create policy "client sees metrics from allowed campaigns"
on public.campaign_metrics
for select
to authenticated
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and (
        exists (
          select 1
          from public.campaigns as campaign
          where campaign.id = campaign_metrics.campaign_id
            and app_user.client_id is not null
            and campaign.client_id = app_user.client_id
        )
        or exists (
          select 1
          from public.user_campaign_permissions as permission
          where permission.user_id = app_user.id
            and permission.campaign_id = campaign_metrics.campaign_id
        )
      )
  )
);
