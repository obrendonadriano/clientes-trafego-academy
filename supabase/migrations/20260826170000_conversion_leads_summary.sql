-- Consolida as quatro contagens da tela de Conversões em uma única consulta.
-- SECURITY INVOKER mantém as policies de RLS do usuário autenticado.
create or replace function public.conversion_leads_summary(
  p_start_date timestamptz default null,
  p_client_id uuid default null
)
returns table (
  total bigint,
  pending bigint,
  qualified bigint,
  discarded bigint
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
    count(*) filter (where lead.qualificacao = 'desqualificado') as discarded
  from public.conversion_leads as lead
  where (p_start_date is null or lead.criado_em >= p_start_date)
    and (p_client_id is null or lead.client_id = p_client_id);
$$;

revoke all on function public.conversion_leads_summary(timestamptz, uuid)
  from public, anon;
grant execute on function public.conversion_leads_summary(timestamptz, uuid)
  to authenticated, service_role;
