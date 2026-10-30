-- Interruptor do admin: libera o Atendimento IA para todos os planos.
-- Ligado: qualquer plano usa a IA. Desligado (padrão): só o Plano Completo,
-- como antes. As travas do banco (trigger e ai_v2_transition) passam a
-- consultar o interruptor junto com o plano.

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  ai_all_plans boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

-- Só service_role (o servidor) lê e grava; sem policy para authenticated.
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select, update on public.platform_settings to service_role;

-- Plano que dá direito à IA: Completo, ou qualquer um com o interruptor ligado.
create or replace function private.ai_plan_allowed(p_plan public.client_plan_type)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_plan = 'complete'
    or coalesce((select s.ai_all_plans from public.platform_settings as s where s.id), false);
$$;

-- ai_v2_transition roda como quem chama (service_role): precisa enxergar a função.
revoke all on function private.ai_plan_allowed(public.client_plan_type) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.ai_plan_allowed(public.client_plan_type) to service_role;

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

  if not coalesce(private.ai_plan_allowed(v_plan), false) then
    raise exception 'O atendimento por IA é exclusivo do Plano Completo.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Downgrade só desliga a IA se o interruptor não liberar todos os planos.
create or replace function private.ai_agent_apply_plan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan_type = 'essential'
    and old.plan_type is distinct from new.plan_type
    and not private.ai_plan_allowed(new.plan_type) then
    update public.ai_agent_settings as settings
    set enabled = false,
        disabled_by_plan_at = now()
    where settings.client_id = new.id
      and settings.enabled;
  end if;

  return new;
end;
$$;

-- ai_v2_transition: troca as duas checagens de plano pela função acima,
-- editando a definição que está no banco (sem copiar as 200 linhas).
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.ai_v2_transition(uuid,text,jsonb)'::regprocedure);
  if position('private.ai_plan_allowed' in v_def) > 0 then
    return;
  end if;
  if position($q$plan_type='complete'$q$ in v_def) = 0 then
    raise exception 'ai_v2_transition: checagem de plano não encontrada';
  end if;
  v_def := replace(v_def, $q$plan_type='complete'$q$, $q$private.ai_plan_allowed(plan_type)$q$);
  execute v_def;
end;
$$;

-- Admin desliga o interruptor: a IA de quem não é Completo para na hora
-- (antes de virar a chave, senão a trava recusaria a própria atualização).
create or replace function public.admin_set_ai_all_plans(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') <> 'service_role' then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if not p_enabled then
    update public.ai_agent_settings as settings
    set enabled = false,
        disabled_by_plan_at = now()
    from public.clients as client
    where client.id = settings.client_id
      and client.plan_type <> 'complete'
      and settings.enabled;
  end if;

  update public.platform_settings
  set ai_all_plans = p_enabled,
      updated_at = now()
  where id;
end;
$$;

revoke all on function public.admin_set_ai_all_plans(boolean) from public, anon, authenticated;
grant execute on function public.admin_set_ai_all_plans(boolean) to service_role;
