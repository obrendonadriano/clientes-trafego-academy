-- Correcao: a visao administrativa do Atendimento IA e lida pelo SERVIDOR do
-- dashboard, que usa a service_role. Com a service_role nao existe auth.uid(),
-- entao private.is_active_admin() retornava falso e a pagina recebia
-- "Acesso negado.".
--
-- A funcao passa a aceitar os dois chamadores: o admin autenticado no
-- navegador e a service_role. A pagina /admin/atendimento-ia ja exige papel de
-- admin na sessao antes de chamar, entao a barreira continua de pe.

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
  -- Aceita o admin autenticado (chamada direta do navegador) E a service_role,
  -- porque a pagina do painel le esta visao pelo servidor. Quem chama pelo
  -- servidor ja confirmou o papel de admin na sessao antes de chegar aqui.
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
     and not private.is_active_admin()
  then
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
