-- Migração: objetivo da campanha (vendas, leads, mensagens, etc.).
-- Usado para escolher o "resultado principal" correto, em vez de adivinhar
-- pelo nome da campanha. IMPORTANTE: rodar no SQL editor do Supabase.
-- Aditiva e segura. Os valores são populados ao reimportar as campanhas.

alter table public.campaigns
  add column if not exists objective text;
