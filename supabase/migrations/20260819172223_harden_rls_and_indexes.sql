-- Complementa o índice único (user_id, campaign_id) para os caminhos que
-- partem da campanha, usados nas políticas e nas remoções em cascata.
create index if not exists user_campaign_permissions_campaign_idx
  on public.user_campaign_permissions (campaign_id);

-- O claim `role` do Supabase Auth identifica o papel do banco
-- (normalmente `authenticated`), não o papel de negócio armazenado em
-- public.users. A função abaixo centraliza a verificação real de admin.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.role = 'admin'::public.app_role
      and app_user.ativo
  );
$$;

revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated, service_role;

drop policy if exists "admin can manage users" on public.users;
create policy "admin can manage users"
on public.users
for all
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists "clients can read own user row" on public.users;
create policy "clients can read own user row"
on public.users
for select
using ((select auth.uid()) = auth_user_id);

drop policy if exists "admin can manage clients" on public.clients;
create policy "admin can manage clients"
on public.clients
for all
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists "admin can manage campaigns" on public.campaigns;
create policy "admin can manage campaigns"
on public.campaigns
for all
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists "client sees allowed campaigns" on public.campaigns;
create policy "client sees allowed campaigns"
on public.campaigns
for select
using (
  exists (
    select 1
    from public.user_campaign_permissions as permission
    join public.users as app_user on app_user.id = permission.user_id
    where permission.campaign_id = campaigns.id
      and app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
  )
);

drop policy if exists "admin manages permissions" on public.user_campaign_permissions;
create policy "admin manages permissions"
on public.user_campaign_permissions
for all
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists "admin manages metrics" on public.campaign_metrics;
create policy "admin manages metrics"
on public.campaign_metrics
for all
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists "client sees metrics from allowed campaigns" on public.campaign_metrics;
create policy "client sees metrics from allowed campaigns"
on public.campaign_metrics
for select
using (
  exists (
    select 1
    from public.user_campaign_permissions as permission
    join public.users as app_user on app_user.id = permission.user_id
    where permission.campaign_id = campaign_metrics.campaign_id
      and app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
  )
);

drop policy if exists "admin manages ai reports" on public.ai_reports;
create policy "admin manages ai reports"
on public.ai_reports
for all
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists "admin manages integration settings" on public.integration_settings;
create policy "admin manages integration settings"
on public.integration_settings
for all
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists "admin manages sync statuses" on public.sync_statuses;
create policy "admin manages sync statuses"
on public.sync_statuses
for all
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists "admin manages meta ad accounts" on public.meta_ad_accounts;
create policy "admin manages meta ad accounts"
on public.meta_ad_accounts
for all
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

-- Esta função remove dados globalmente. Ela só deve ser chamada pelo backend
-- privilegiado, nunca diretamente por clientes autenticados.
revoke all on function public.prune_ai_reports(integer)
  from public, anon, authenticated;
grant execute on function public.prune_ai_reports(integer) to service_role;
