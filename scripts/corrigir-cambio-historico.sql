-- ---------------------------------------------------------------------------
-- Corrige o câmbio das métricas em dólar já gravadas.
--
-- Contexto: de 09/06/2026 até 19/08/2026 todas as 18.565 linhas em USD foram
-- gravadas com exchange_rate = 5,40 — o valor de emergência do código, porque
-- a fonte de cotação não respondia no ambiente de produção. O dólar real ficou
-- entre 5,02 e 5,22 no período, então os valores em reais estão inflados.
--
-- Este script reconverte cada linha pela PTAX (cotação de fechamento do Banco
-- Central) do dia do gasto. O valor em dólar é preservado: ele é recuperado de
-- amount_spent / exchange_rate, que é exato porque a taxa gravada é conhecida.
--
-- Dias sem PTAX (fim de semana e feriado) usam a cotação do dia útil anterior.
--
-- Efeito medido na simulação: R$ 57.829,17 -> R$ 54.820,42 (R$ 3.008,75 a menos).
--
-- COMO RODAR: cole no SQL Editor do Supabase e execute os passos em ordem.
-- ---------------------------------------------------------------------------

-- PASSO 1 — Backup (já criado em 19/08/2026; rodar de novo não faz mal).
create table if not exists campaign_metrics_backup_cambio_20260819 as
select * from campaign_metrics where currency = 'USD';

-- PASSO 2 — Conferir o backup antes de seguir.
select count(*) as linhas_no_backup,
       round(sum(amount_spent)::numeric, 2) as total_antes
from campaign_metrics_backup_cambio_20260819;

-- PASSO 3 — A correção.
with ptax(dia, taxa) as (values
  ('2026-06-01'::date, 5.0303),('2026-06-02'::date, 5.016),('2026-06-03'::date, 5.0415),
  ('2026-06-05'::date, 5.1244),('2026-06-08'::date, 5.1695),('2026-06-09'::date, 5.1693),
  ('2026-06-10'::date, 5.1763),('2026-06-11'::date, 5.1478),('2026-06-12'::date, 5.0827),
  ('2026-06-15'::date, 5.043),('2026-06-16'::date, 5.078),('2026-06-17'::date, 5.0641),
  ('2026-06-18'::date, 5.1613),('2026-06-19'::date, 5.1442),('2026-06-22'::date, 5.1395),
  ('2026-06-23'::date, 5.1743),('2026-06-24'::date, 5.2098),('2026-06-25'::date, 5.1892),
  ('2026-06-26'::date, 5.1695),('2026-06-29'::date, 5.1717),('2026-06-30'::date, 5.1766),
  ('2026-07-01'::date, 5.195),('2026-07-02'::date, 5.1945),('2026-07-03'::date, 5.1717),
  ('2026-07-06'::date, 5.167),('2026-07-07'::date, 5.1458),('2026-07-08'::date, 5.1552),
  ('2026-07-09'::date, 5.1329),('2026-07-10'::date, 5.1088),('2026-07-13'::date, 5.1183),
  ('2026-07-14'::date, 5.0742),('2026-07-15'::date, 5.0727),('2026-07-16'::date, 5.0975),
  ('2026-07-17'::date, 5.1176),('2026-07-20'::date, 5.0894),('2026-07-21'::date, 5.078),
  ('2026-07-22'::date, 5.0638),('2026-07-23'::date, 5.0807),('2026-07-24'::date, 5.0666),
  ('2026-07-27'::date, 5.1005),('2026-07-28'::date, 5.1177),('2026-07-29'::date, 5.1217),
  ('2026-07-30'::date, 5.0739),('2026-07-31'::date, 5.0773),('2026-08-03'::date, 5.0723),
  ('2026-08-04'::date, 5.1053),('2026-08-05'::date, 5.1154),('2026-08-06'::date, 5.1017),
  ('2026-08-07'::date, 5.0908),('2026-08-10'::date, 5.0963),('2026-08-11'::date, 5.1285),
  ('2026-08-12'::date, 5.1639),('2026-08-13'::date, 5.1859),('2026-08-14'::date, 5.2236),
  ('2026-08-17'::date, 5.2014),('2026-08-18'::date, 5.2043),('2026-08-19'::date, 5.1714)
),
alvo as (
  select m.id,
         -- cotação do próprio dia ou, se não houver, a do dia útil anterior
         (select p.taxa from ptax p where p.dia <= m.date order by p.dia desc limit 1) as taxa_do_dia
  from campaign_metrics m
  where m.currency = 'USD' and m.exchange_rate > 0
)
update campaign_metrics m
set amount_spent  = m.amount_spent  / m.exchange_rate * a.taxa_do_dia,
    cpc           = m.cpc           / m.exchange_rate * a.taxa_do_dia,
    cpm           = m.cpm           / m.exchange_rate * a.taxa_do_dia,
    cost_per_lead = m.cost_per_lead / m.exchange_rate * a.taxa_do_dia,
    exchange_rate = a.taxa_do_dia
from alvo a
where m.id = a.id and a.taxa_do_dia is not null;
-- ctr, roas, roi e frequency são razões: não mudam com a moeda.

-- PASSO 4 — Conferência. O esperado é ~R$ 54.820,42 e taxas entre 5,04 e 5,23.
select count(*) as linhas,
       round(sum(amount_spent)::numeric, 2) as total_depois,
       round(min(exchange_rate)::numeric, 4) as menor_taxa,
       round(max(exchange_rate)::numeric, 4) as maior_taxa
from campaign_metrics
where currency = 'USD';

-- ---------------------------------------------------------------------------
-- SE PRECISAR VOLTAR ATRÁS (restaura exatamente o estado anterior):
--
-- update campaign_metrics m
-- set amount_spent  = b.amount_spent,
--     cpc           = b.cpc,
--     cpm           = b.cpm,
--     cost_per_lead = b.cost_per_lead,
--     exchange_rate = b.exchange_rate
-- from campaign_metrics_backup_cambio_20260819 b
-- where m.id = b.id;
--
-- Depois de conferir que está tudo certo, o backup pode ser removido:
-- drop table campaign_metrics_backup_cambio_20260819;
-- ---------------------------------------------------------------------------
