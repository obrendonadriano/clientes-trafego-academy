-- Nome e compartilhamento do Dataset de Conversões do WhatsApp (best-effort).
--
-- O onboarding tenta renomear o Dataset para "<cliente> · WhatsApp CAPI" e
-- verifica se a BM da agência já tem acesso a ele. O resultado fica aqui para
-- o diagnóstico do admin. Migração só aditiva: nenhuma coluna existente,
-- dado, função ou política é alterado.

alter table public.client_whatsapp_connections
  add column if not exists dataset_name text,
  add column if not exists dataset_rename_status text,
  add column if not exists dataset_rename_reason text,
  add column if not exists dataset_share_status text,
  add column if not exists dataset_share_reason text,
  add column if not exists dataset_checked_at timestamptz;
