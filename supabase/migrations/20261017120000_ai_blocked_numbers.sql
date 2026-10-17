-- Números que o Atendimento IA nunca responde (fornecedores, equipe, família).
--
-- Cada cliente mantém a própria lista pelo painel. `blocked` permite deixar o
-- número cadastrado e liberado, sem apagar o histórico da decisão. O número é
-- gravado como no restante da IA: só dígitos, com 55 (ex.: 5511912345678).
-- Somente estrutura nova: nada existente é alterado.

create table if not exists public.ai_blocked_numbers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  whatsapp_number text not null check (whatsapp_number ~ '^55\d{10,11}$'),
  label text check (label is null or char_length(label) <= 80),
  blocked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, whatsapp_number)
);

create index if not exists ai_blocked_numbers_lookup
  on public.ai_blocked_numbers (client_id, whatsapp_number)
  where blocked;

alter table public.ai_blocked_numbers enable row level security;

drop policy if exists "admin manages ai blocked numbers" on public.ai_blocked_numbers;
create policy "admin manages ai blocked numbers"
on public.ai_blocked_numbers
for all
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.role = 'admin'
  )
);

drop policy if exists "client reads own ai blocked numbers" on public.ai_blocked_numbers;
create policy "client reads own ai blocked numbers"
on public.ai_blocked_numbers
for select
using (
  exists (
    select 1
    from public.users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.ativo
      and app_user.client_id = ai_blocked_numbers.client_id
  )
);

-- Gravação só pelo servidor (service_role), depois da checagem de plano e
-- segmento nas server actions — como as demais tabelas da IA.
revoke all on table public.ai_blocked_numbers from anon, authenticated;
grant select on table public.ai_blocked_numbers to authenticated;
grant all on table public.ai_blocked_numbers to service_role;
