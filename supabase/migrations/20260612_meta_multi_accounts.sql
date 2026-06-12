-- Migração: suporte a múltiplas contas de anúncio da Meta.
-- IMPORTANTE: rodar no SQL editor do Supabase de PRODUÇÃO antes do deploy do
-- código novo. É aditiva e segura (não apaga nada).

-- Uma linha por conta de anúncio. O token compartilhado da Business Manager
-- continua em integration_settings; access_token aqui é OPCIONAL (se nulo, a
-- conta usa o token compartilhado).
create table if not exists public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  ad_account_id text not null,
  access_token text,
  enabled boolean not null default true,
  status text not null default 'pending',
  last_message text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_ad_accounts_ad_account_id_key
  on public.meta_ad_accounts (ad_account_id);

-- Registra de qual conta cada campanha veio (organização + limpeza ao remover
-- a conta). Não derruba o vínculo com cliente.
alter table public.campaigns
  add column if not exists meta_account_id uuid
  references public.meta_ad_accounts(id) on delete set null;

create index if not exists campaigns_meta_account_idx
  on public.campaigns (meta_account_id);

alter table public.meta_ad_accounts enable row level security;

drop policy if exists "admin manages meta ad accounts" on public.meta_ad_accounts;
create policy "admin manages meta ad accounts"
on public.meta_ad_accounts
for all
using (auth.jwt() ->> 'role' = 'admin')
with check (auth.jwt() ->> 'role' = 'admin');
