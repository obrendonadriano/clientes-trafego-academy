-- Exportação unificada: coluna de status do lead (qualificado ou não).
--   Coexistência / WAHA: conversion_leads.qualificacao
--     (pendente, qualificado, fechado, desqualificado);
--   Atendimento IA: ai_conversations.status (new, qualifying, qualified,
--     disqualified) ou "human" quando a equipe assumiu antes de um resultado,
--     com o motivo da desqualificação;
--   Formulário Meta: sem status.
-- goal_type diz se "fechado" é venda ou veículo adquirido.
--
-- O tipo de retorno muda, então a função é recriada (drop + create). Só
-- leitura; nenhuma tabela é alterada.

drop function if exists public.admin_export_unified_leads(timestamptz, timestamptz, uuid[], text[], integer, integer);

-- Leads unificados, paginados (ordem estável: mais recente primeiro).
-- p_client_ids null = todos os clientes dos dois nichos.
-- p_origins null = todas as origens.
create or replace function public.admin_export_unified_leads(
  p_from timestamptz,
  p_to timestamptz,
  p_client_ids uuid[] default null,
  p_origins text[] default null,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  origin text,
  lead_id text,
  client_id uuid,
  client_name text,
  entered_at timestamptz,
  lead_name text,
  phone text,
  platform text,
  bank text,
  installment_value text,
  overdue_installments text,
  paid_installments text,
  financing_status text,
  priority text,
  ad_id text,
  ad_name text,
  adset_name text,
  campaign_name text,
  form_name text,
  ai_financed boolean,
  ai_has_overdue boolean,
  ai_overdue_count integer,
  lead_status text,
  goal_type text,
  ai_disqualification text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_admin();

  return query
  with niche_clients as (
    select c.id, c.nome_empresa, c.conversion_goal_type
    from public.clients c
    where c.segmento in ('veiculo_quitacao', 'veiculo_atrasado')
      and (p_client_ids is null or c.id = any (p_client_ids))
  ), unified as (
    select
      case
        when l.wa_message_id is not null or l.phone_number_id is not null
          then 'Coexistência'
        else 'WAHA (legado)'
      end as origin,
      l.id::text as lead_id,
      nc.id as client_id,
      nc.nome_empresa as client_name,
      l.criado_em as entered_at,
      l.nome as lead_name,
      l.telefone as phone,
      'WhatsApp'::text as platform,
      null::text as bank,
      null::text as installment_value,
      null::text as overdue_installments,
      null::text as paid_installments,
      null::text as financing_status,
      null::text as priority,
      nullif(btrim(l.ad_source_id), '') as ad_id,
      coalesce(metric.name, cached.ad_name) as ad_name,
      coalesce(metric.adset_name, cached.adset_name) as adset_name,
      coalesce(metric.campaign_name, cached.campaign_name) as campaign_name,
      null::text as form_name,
      null::boolean as ai_financed,
      null::boolean as ai_has_overdue,
      null::integer as ai_overdue_count,
      l.qualificacao::text as lead_status,
      nc.conversion_goal_type::text as goal_type,
      null::text as ai_disqualification
    from public.conversion_leads l
    join niche_clients nc on nc.id = l.client_id
    left join lateral (
      select m.name, m.adset_name, m.campaign_name
      from public.meta_ad_level_metrics m
      where m.level = 'ad' and m.external_id = l.ad_source_id
      order by m.date desc
      limit 1
    ) metric on true
    left join public.meta_ad_names cached on cached.ad_id = l.ad_source_id
    where l.criado_em >= p_from and l.criado_em < p_to

    union all

    select
      'Atendimento IA', a.id::text, nc.id, nc.nome_empresa, a.criado_em,
      coalesce(nullif(btrim(a.name), ''), nullif(btrim(a.whatsapp_display_name), '')),
      a.whatsapp_number, 'WhatsApp', nullif(btrim(a.bank), ''),
      null, null, null, null, null, null, null, null, null, null,
      a.financed, a.has_overdue_installments, a.overdue_installments_count,
      -- Atendimento humano só quando a IA não chegou a um resultado.
      case
        when a.status in ('qualified', 'disqualified') then a.status
        when a.human_takeover then 'human'
        else a.status
      end,
      nc.conversion_goal_type::text,
      nullif(btrim(a.disqualification_reason), '')
    from public.ai_conversations a
    join niche_clients nc on nc.id = a.client_id
    where a.criado_em >= p_from and a.criado_em < p_to

    union all

    select
      'Formulário Meta', f.meta_lead_id, nc.id, nc.nome_empresa, f.created_time,
      f.full_name, f.phone, f.platform, f.bank, f.installment_value,
      f.overdue_installments, f.paid_installments, f.financing_status,
      f.priority, f.ad_id, f.ad_name, f.adset_name, f.campaign_name,
      f.form_name, null, null, null, null, nc.conversion_goal_type::text, null
    from public.meta_form_leads f
    join niche_clients nc on nc.id = f.client_id
    where f.created_time >= p_from and f.created_time < p_to
  )
  select u.*
  from unified u
  where p_origins is null or u.origin = any (p_origins)
  order by u.entered_at desc, u.origin, u.lead_id
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.admin_export_unified_leads(timestamptz, timestamptz, uuid[], text[], integer, integer) from public, anon;
grant execute on function public.admin_export_unified_leads(timestamptz, timestamptz, uuid[], text[], integer, integer) to authenticated, service_role;
