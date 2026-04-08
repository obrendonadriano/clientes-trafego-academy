create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'app_role'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.app_role as enum ('admin', 'client');
  end if;
end
$$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  nome_empresa text not null,
  responsavel text not null,
  whatsapp text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  nome text not null,
  username text unique not null,
  email text unique not null,
  role public.app_role not null default 'client',
  whatsapp text,
  ativo boolean not null default true,
  client_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  status text not null,
  plataforma text not null,
  client_id uuid references public.clients(id) on delete set null,
  external_id text unique,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.user_campaign_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  unique (user_id, campaign_id)
);

create table if not exists public.campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  date date not null,
  amount_spent numeric(12,2) not null default 0,
  reach integer not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  ctr numeric(8,2) not null default 0,
  cpc numeric(12,2) not null default 0,
  cpm numeric(12,2) not null default 0,
  leads integer not null default 0,
  cost_per_lead numeric(12,2) not null default 0,
  roi numeric(12,2) not null default 0,
  roas numeric(12,2) not null default 0,
  frequency numeric(8,2) not null default 0
);

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  period_start date not null,
  period_end date not null,
  generated_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.users
  add column if not exists auth_user_id uuid,
  add column if not exists nome text,
  add column if not exists username text,
  add column if not exists email text,
  add column if not exists role public.app_role not null default 'client',
  add column if not exists whatsapp text,
  add column if not exists ativo boolean not null default true,
  add column if not exists client_id uuid,
  add column if not exists created_at timestamptz not null default now();

alter table public.clients
  add column if not exists nome_empresa text,
  add column if not exists responsavel text,
  add column if not exists whatsapp text,
  add column if not exists observacoes text,
  add column if not exists ativo boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

alter table public.campaigns
  add column if not exists nome text,
  add column if not exists status text,
  add column if not exists plataforma text,
  add column if not exists client_id uuid,
  add column if not exists external_id text,
  add column if not exists source text not null default 'manual',
  add column if not exists created_at timestamptz not null default now();

alter table public.campaigns
  alter column client_id drop not null;

alter table public.user_campaign_permissions
  add column if not exists user_id uuid,
  add column if not exists campaign_id uuid;

alter table public.campaign_metrics
  add column if not exists campaign_id uuid,
  add column if not exists date date,
  add column if not exists amount_spent numeric(12,2) not null default 0,
  add column if not exists reach integer not null default 0,
  add column if not exists impressions integer not null default 0,
  add column if not exists clicks integer not null default 0,
  add column if not exists ctr numeric(8,2) not null default 0,
  add column if not exists cpc numeric(12,2) not null default 0,
  add column if not exists cpm numeric(12,2) not null default 0,
  add column if not exists leads integer not null default 0,
  add column if not exists cost_per_lead numeric(12,2) not null default 0,
  add column if not exists roi numeric(12,2) not null default 0,
  add column if not exists roas numeric(12,2) not null default 0,
  add column if not exists frequency numeric(8,2) not null default 0;

alter table public.ai_reports
  add column if not exists client_id uuid,
  add column if not exists user_id uuid,
  add column if not exists campaign_id uuid,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists generated_text text,
  add column if not exists created_at timestamptz not null default now();

alter table public.integration_settings
  add column if not exists provider text,
  add column if not exists enabled boolean not null default false,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_client_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete set null;
  end if;
end
$$;

create unique index if not exists campaign_metrics_campaign_id_date_key
on public.campaign_metrics(campaign_id, date);

alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.campaigns enable row level security;
alter table public.user_campaign_permissions enable row level security;
alter table public.campaign_metrics enable row level security;
alter table public.ai_reports enable row level security;
alter table public.integration_settings enable row level security;

drop policy if exists "admin can manage users" on public.users;
create policy "admin can manage users"
on public.users
for all
using (auth.jwt() ->> 'role' = 'admin')
with check (auth.jwt() ->> 'role' = 'admin');

drop policy if exists "clients can read own user row" on public.users;
create policy "clients can read own user row"
on public.users
for select
using (auth.uid() = auth_user_id);

drop policy if exists "admin can manage clients" on public.clients;
create policy "admin can manage clients"
on public.clients
for all
using (auth.jwt() ->> 'role' = 'admin')
with check (auth.jwt() ->> 'role' = 'admin');

drop policy if exists "admin can manage campaigns" on public.campaigns;
create policy "admin can manage campaigns"
on public.campaigns
for all
using (auth.jwt() ->> 'role' = 'admin')
with check (auth.jwt() ->> 'role' = 'admin');

drop policy if exists "client sees allowed campaigns" on public.campaigns;
create policy "client sees allowed campaigns"
on public.campaigns
for select
using (
  exists (
    select 1
    from public.user_campaign_permissions permission
    join public.users app_user on app_user.id = permission.user_id
    where permission.campaign_id = campaigns.id
      and app_user.auth_user_id = auth.uid()
  )
);

drop policy if exists "admin manages permissions" on public.user_campaign_permissions;
create policy "admin manages permissions"
on public.user_campaign_permissions
for all
using (auth.jwt() ->> 'role' = 'admin')
with check (auth.jwt() ->> 'role' = 'admin');

drop policy if exists "admin manages metrics" on public.campaign_metrics;
create policy "admin manages metrics"
on public.campaign_metrics
for all
using (auth.jwt() ->> 'role' = 'admin')
with check (auth.jwt() ->> 'role' = 'admin');

drop policy if exists "client sees metrics from allowed campaigns" on public.campaign_metrics;
create policy "client sees metrics from allowed campaigns"
on public.campaign_metrics
for select
using (
  exists (
    select 1
    from public.user_campaign_permissions permission
    join public.users app_user on app_user.id = permission.user_id
    where permission.campaign_id = campaign_metrics.campaign_id
      and app_user.auth_user_id = auth.uid()
  )
);

drop policy if exists "admin manages ai reports" on public.ai_reports;
create policy "admin manages ai reports"
on public.ai_reports
for all
using (auth.jwt() ->> 'role' = 'admin')
with check (auth.jwt() ->> 'role' = 'admin');

drop policy if exists "admin manages integration settings" on public.integration_settings;
create policy "admin manages integration settings"
on public.integration_settings
for all
using (auth.jwt() ->> 'role' = 'admin')
with check (auth.jwt() ->> 'role' = 'admin');
