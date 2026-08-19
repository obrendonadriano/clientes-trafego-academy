alter table public.meta_ad_level_metrics
  add column if not exists status text not null default 'UNKNOWN',
  add column if not exists effective_status text not null default 'UNKNOWN',
  add column if not exists exchange_rate numeric(12, 6) not null default 1;

-- Os snapshots antigos de contas estrangeiras foram salvos na moeda original.
-- A métrica diária da campanha já guarda a cotação utilizada no mesmo dia;
-- ela permite converter o histórico existente sem buscar novamente na Meta.
update public.meta_ad_level_metrics as metric
set
  amount_spent = metric.amount_spent * campaign_metric.exchange_rate,
  exchange_rate = campaign_metric.exchange_rate
from public.campaign_metrics as campaign_metric
where campaign_metric.campaign_id = metric.campaign_id
  and campaign_metric.date = metric.date
  and campaign_metric.granularity = 'day'
  and campaign_metric.exchange_rate > 0
  and upper(metric.currency) <> 'BRL'
  and metric.exchange_rate = 1;

drop function if exists public.get_meta_ad_level_summary(text, date, date, uuid[], text);

create function public.get_meta_ad_level_summary(
  p_level text,
  p_start date,
  p_end date,
  p_campaign_ids uuid[] default null,
  p_adset_external_id text default null
)
returns table (
  external_id text,
  name text,
  campaign_id uuid,
  campaign_name text,
  adset_external_id text,
  adset_name text,
  amount_spent numeric,
  amount_spent_original numeric,
  impressions bigint,
  clicks bigint,
  result_count numeric,
  result_label text,
  currency text,
  exchange_rate numeric,
  status text,
  effective_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    metric.external_id,
    (array_agg(metric.name order by metric.date desc))[1] as name,
    metric.campaign_id,
    (array_agg(metric.campaign_name order by metric.date desc))[1] as campaign_name,
    metric.adset_external_id,
    (array_agg(metric.adset_name order by metric.date desc))[1] as adset_name,
    sum(metric.amount_spent) as amount_spent,
    sum(metric.amount_spent / nullif(metric.exchange_rate, 0)) as amount_spent_original,
    sum(metric.impressions)::bigint as impressions,
    sum(metric.clicks)::bigint as clicks,
    sum(metric.result_count) as result_count,
    (array_agg(metric.result_label order by metric.date desc))[1] as result_label,
    metric.currency,
    case
      when sum(metric.amount_spent / nullif(metric.exchange_rate, 0)) > 0
        then sum(metric.amount_spent) /
          sum(metric.amount_spent / nullif(metric.exchange_rate, 0))
      else max(metric.exchange_rate)
    end as exchange_rate,
    (array_agg(metric.status order by metric.date desc))[1] as status,
    (array_agg(metric.effective_status order by metric.date desc))[1] as effective_status
  from public.meta_ad_level_metrics as metric
  where metric.level = p_level
    and metric.date between p_start and p_end
    and (p_campaign_ids is null or metric.campaign_id = any(p_campaign_ids))
    and (p_adset_external_id is null or metric.adset_external_id = p_adset_external_id)
  group by
    metric.external_id,
    metric.campaign_id,
    metric.adset_external_id,
    metric.currency
  order by sum(metric.amount_spent) desc;
$$;

revoke all on function public.get_meta_ad_level_summary(text, date, date, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.get_meta_ad_level_summary(text, date, date, uuid[], text)
  to service_role;
