-- Migração: moeda original e taxa de conversão por métrica.
-- Permite mostrar o valor em dólar (original) ao lado do valor em real.
-- IMPORTANTE: rodar no SQL editor do Supabase de PRODUÇÃO. Aditiva e segura.
--
-- Os valores monetários (amount_spent, cpc, cpm, cost_per_lead) continuam
-- gravados em BRL. O original na moeda da conta é reconstruído por
-- valor_brl / exchange_rate. Dados antigos ficam BRL / 1 (corrigidos ao
-- reimportar as métricas).

alter table public.campaign_metrics
  add column if not exists currency text not null default 'BRL';

alter table public.campaign_metrics
  add column if not exists exchange_rate numeric(12,6) not null default 1;
