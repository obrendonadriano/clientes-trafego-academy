-- Migração: fundação de performance (aditiva, segura para produção).
-- IMPORTANTE: rodar no SQL editor do Supabase de PRODUÇÃO antes de fazer
-- deploy do código que filtra métricas por data no banco.

-- Índices para filtro de métricas por campanha + janela de datas.
create index if not exists campaign_metrics_campaign_date_idx
  on public.campaign_metrics (campaign_id, date desc);

create index if not exists campaign_metrics_date_idx
  on public.campaign_metrics (date desc);

create index if not exists user_campaign_permissions_user_idx
  on public.user_campaign_permissions (user_id);

create index if not exists campaigns_client_idx
  on public.campaigns (client_id);

-- Relatórios de IA passam a registrar TODAS as campanhas analisadas.
-- A coluna legada campaign_id é mantida (não dropar).
alter table public.ai_reports
  add column if not exists campaign_ids uuid[] default null;

-- Limpeza atômica do histórico de relatórios (mantém os 10 mais recentes),
-- substituindo o delete em duas etapas feito pela aplicação.
create or replace function public.prune_ai_reports(keep_count integer default 10)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ai_reports
  where id not in (
    select id
    from public.ai_reports
    order by created_at desc
    limit keep_count
  );
$$;
