-- Auditoria SOMENTE LEITURA do pipeline de Conversões.
-- Cole no SQL Editor do Supabase antes e depois da migração
-- 20261007120000_conversions_pipeline_v4_reconciliation. Não escreve nada:
-- só SELECT em catálogo e contagens. Não mostra tokens nem telefones.

select 'pipeline_version' as item, public.conversion_pipeline_version()::text as valor

union all
select 'clients.conversion_goal_type', coalesce((
  select data_type || ' default ' || column_default from information_schema.columns
  where table_schema = 'public' and table_name = 'clients' and column_name = 'conversion_goal_type'), 'AUSENTE')

union all
select 'clients_conversion_goal_type_check', case when exists (
  select 1 from pg_constraint where conname = 'clients_conversion_goal_type_check') then 'ok' else 'AUSENTE' end

union all
select 'conversion_events.custom_data', coalesce((
  select data_type from information_schema.columns
  where table_schema = 'private' and table_name = 'conversion_events' and column_name = 'custom_data'), 'AUSENTE')

union all
select 'capture_conversion_events gera Purchase',
  case when p.prosrc like '%''Purchase''%' and p.prosrc like '%conversion_goal_type%' then 'sim' else 'NÃO' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'capture_conversion_events'

union all
select 'enqueue_conversion_event grava custom_data',
  case when p.prosrc like '%custom_data%' then 'sim' else 'NÃO' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'enqueue_conversion_event'

union all
select 'guard exige valor em venda',
  case when p.prosrc like '%Informe o valor da venda%' then 'sim' else 'NÃO' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'guard_conversion_lead_update'

union all
select 'capi_fetch_queue devolve custom_data',
  case when pg_get_function_result(p.oid) like '%custom_data jsonb%' then 'sim' else 'NÃO' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'capi_fetch_queue'

union all
select 'admin_client_capi_status devolve goal_type',
  case when pg_get_function_result(p.oid) like '%goal_type text%' then 'sim' else 'NÃO' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'admin_client_capi_status'

union all
select 'capi_fetch_queue executável por anon/authenticated',
  case when has_function_privilege('anon', 'public.capi_fetch_queue(integer)', 'execute')
         or has_function_privilege('authenticated', 'public.capi_fetch_queue(integer)', 'execute')
       then 'SIM (errado)' else 'não' end

union all
-- Funções que a reconciliação NÃO toca: a impressão digital deve ser a mesma
-- antes e depois.
select 'md5 ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
  md5(pg_get_functiondef(p.oid))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('public', 'capi_mark_result'), ('public', 'meta_save_whatsapp_connection'),
  ('public', 'meta_ingest_ad_lead'), ('public', 'meta_record_business_app_sync'),
  ('public', 'waha_ingest_lead'), ('private', 'official_integration_is_healthy'),
  ('private', 'promote_client_to_official'))

union all
select 'gatilho em conversion_leads: ' || t.tgname, p.proname
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.conversion_leads'::regclass and not t.tgisinternal

union all
select 'eventos ' || event_name || '/' || status::text, count(*)::text
from private.conversion_events group by event_name, status

union all
select 'clientes ' || conversion_goal_type, count(*)::text
from public.clients group by conversion_goal_type

order by 1;
