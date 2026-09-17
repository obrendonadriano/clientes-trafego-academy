-- Corrige dois defeitos da visao administrativa do Atendimento IA.
--
-- 1) Acesso negado (42501): a pagina le esta visao pelo SERVIDOR, com a
--    service_role, e nesse contexto nao existe auth.uid() — entao
--    private.is_active_admin() retornava falso e barrava o proprio dashboard.
--    Agora a funcao aceita os dois chamadores. A barreira continua de pe: a
--    pagina /admin/atendimento-ia exige papel de admin na sessao antes de
--    chamar.
--
-- 2) Tipos incompativeis (42804): whatsapp_sessions.status e o enum
--    public.waha_session_status, e a funcao declara text. Faltavam os casts.
--
-- Pode rodar de novo com seguranca: e create or replace.

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

  -- Os casts sao obrigatorios: whatsapp_sessions.status e o enum
  -- public.waha_session_status, nao text. Sem o ::text o Postgres recusa a
  -- consulta com 42804 (structure of query does not match function result
  -- type). Os counts vao explicitos por bigint pelo mesmo motivo.
  return query
  select client.id,
         client.nome_empresa::text,
         client.plan_type,
         coalesce(settings.enabled, false),
         settings.notification_whatsapp::text,
         session.status::text,
         session.phone_number::text,
         coalesce(stats.total, 0)::bigint,
         coalesce(stats.qualified, 0)::bigint
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
