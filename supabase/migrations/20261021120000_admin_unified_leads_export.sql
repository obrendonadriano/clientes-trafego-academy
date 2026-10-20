-- Exportação unificada de leads (somente admin) e importação do CSV de
-- formulários da Meta.
--
-- Origens da exportação:
--   - "Coexistência"     public.conversion_leads gravado pela API oficial
--                        (wa_message_id / phone_number_id preenchidos);
--   - "WAHA (legado)"    public.conversion_leads gravado pelo WAHA;
--   - "Atendimento IA"   public.ai_conversations;
--   - "Formulário Meta"  public.meta_form_leads (CSV importado pelo admin).
-- Só clientes dos nichos veiculo_quitacao e veiculo_atrasado.
--
-- Acesso: as duas RPCs checam auth.uid() (do JWT) em public.users com
-- role = 'admin' e ativo. Qualquer outro usuário recebe 42501, mesmo
-- chamando a RPC direto. A exportação é só leitura.
--
-- Migração só aditiva: duas tabelas novas e três funções novas. Nenhuma
-- tabela, função ou política existente é alterada.

create table if not exists public.meta_form_leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- ID do lead da Meta sem o prefixo "l:". Um lead é importado uma vez só.
  meta_lead_id text not null unique,
  created_time timestamptz not null,
  ad_id text,
  ad_name text,
  adset_id text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  form_id text,
  form_name text,
  platform text,
  priority text,
  full_name text,
  phone text,
  bank text,
  installment_value text,
  overdue_installments text,
  paid_installments text,
  financing_status text,
  -- Todas as perguntas do formulário, já limpas (pergunta -> resposta).
  answers jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  imported_by uuid
);

create index if not exists meta_form_leads_client_time
  on public.meta_form_leads (client_id, created_time desc);

-- Nomes de anúncio/conjunto/campanha buscados na Marketing API para leads da
-- Coexistência cujo anúncio ainda não está no cache de métricas.
create table if not exists public.meta_ad_names (
  ad_id text primary key,
  ad_name text,
  adset_name text,
  campaign_name text,
  fetched_at timestamptz not null default now()
);

alter table public.meta_form_leads enable row level security;
alter table public.meta_ad_names enable row level security;
-- Sem políticas para authenticated: só as RPCs de admin (security definer) e
-- o servidor (service_role) acessam.
revoke all on table public.meta_form_leads from public, anon, authenticated;
revoke all on table public.meta_ad_names from public, anon, authenticated;
grant all on table public.meta_form_leads to service_role;
grant all on table public.meta_ad_names to service_role;

create or replace function private.require_active_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.role::text = 'admin'
      and u.ativo
  ) then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_active_admin() from public, anon, authenticated;

-- Importa leads do CSV da Meta para um cliente. Linhas com meta_lead_id já
-- existente são ignoradas (não duplica nem sobrescreve).
create or replace function public.admin_import_meta_form_leads(
  p_client_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_inserted integer;
begin
  perform private.require_active_admin();

  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato inválido.' using errcode = '22023';
  end if;

  v_total := jsonb_array_length(p_rows);

  with incoming as (
    select *
    from jsonb_to_recordset(p_rows) as r(
      meta_lead_id text, created_time timestamptz, ad_id text, ad_name text,
      adset_id text, adset_name text, campaign_id text, campaign_name text,
      form_id text, form_name text, platform text, priority text,
      full_name text, phone text, bank text, installment_value text,
      overdue_installments text, paid_installments text,
      financing_status text, answers jsonb
    )
    where nullif(btrim(meta_lead_id), '') is not null and created_time is not null
  ), inserted as (
    insert into public.meta_form_leads (
      client_id, meta_lead_id, created_time, ad_id, ad_name, adset_id,
      adset_name, campaign_id, campaign_name, form_id, form_name, platform,
      priority, full_name, phone, bank, installment_value,
      overdue_installments, paid_installments, financing_status, answers,
      imported_by
    )
    select distinct on (btrim(meta_lead_id))
      p_client_id, btrim(meta_lead_id), created_time, ad_id, ad_name, adset_id,
      adset_name, campaign_id, campaign_name, form_id, form_name, platform,
      priority, full_name, phone, bank, installment_value,
      overdue_installments, paid_installments, financing_status,
      coalesce(answers, '{}'::jsonb),
      (select u.id from public.users u where u.auth_user_id = auth.uid() limit 1)
    from incoming
    order by btrim(meta_lead_id)
    on conflict (meta_lead_id) do nothing
    returning 1
  )
  select count(*) into v_inserted from inserted;

  return jsonb_build_object(
    'received', v_total,
    'inserted', v_inserted,
    'skipped', v_total - v_inserted
  );
end;
$$;

revoke all on function public.admin_import_meta_form_leads(uuid, jsonb) from public, anon;
grant execute on function public.admin_import_meta_form_leads(uuid, jsonb) to authenticated, service_role;

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
  ai_overdue_count integer
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
    select c.id, c.nome_empresa
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
      null::integer as ai_overdue_count
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
      a.financed, a.has_overdue_installments, a.overdue_installments_count
    from public.ai_conversations a
    join niche_clients nc on nc.id = a.client_id
    where a.criado_em >= p_from and a.criado_em < p_to

    union all

    select
      'Formulário Meta', f.meta_lead_id, nc.id, nc.nome_empresa, f.created_time,
      f.full_name, f.phone, f.platform, f.bank, f.installment_value,
      f.overdue_installments, f.paid_installments, f.financing_status,
      f.priority, f.ad_id, f.ad_name, f.adset_name, f.campaign_name,
      f.form_name, null, null, null
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
