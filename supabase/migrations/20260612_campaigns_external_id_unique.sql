-- Migração: garante a restrição de unicidade em campaigns.external_id.
-- Necessária para o upsert de campanhas da Meta (ON CONFLICT external_id).
-- Bancos criados por versões antigas adicionaram a coluna sem a constraint.
-- IMPORTANTE: rodar no SQL editor do Supabase de PRODUÇÃO.
--
-- Índice único normal: no Postgres, múltiplos NULL não conflitam — campanhas
-- manuais (external_id nulo) continuam permitidas; só os IDs da Meta ficam
-- únicos. Se este comando falhar por duplicatas, rode antes a consulta de
-- diagnóstico no fim deste arquivo.

create unique index if not exists campaigns_external_id_key
  on public.campaigns (external_id);

-- Diagnóstico (rodar SÓ se a criação acima acusar duplicatas):
-- select external_id, count(*)
-- from public.campaigns
-- where external_id is not null
-- group by external_id
-- having count(*) > 1;
