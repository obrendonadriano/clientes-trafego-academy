-- Coexistence (onboarding do aplicativo WhatsApp Business): registro das
-- sincronizações obrigatórias.
--
-- A documentação oficial ("Onboard WhatsApp Business app users") exige pedir,
-- em até 24 horas após o onboarding, a sincronização de contatos
-- (sync_type=smb_app_state_sync) e de histórico (sync_type=history) via
-- POST /{PHONE_NUMBER_ID}/smb_app_data — uma única vez. Sem isso a Meta
-- desconecta o número da integração.
--
-- Esta migração só guarda QUANDO cada pedido foi feito, para não repetir numa
-- reconexão do mesmo número e para o administrador conferir. Aditiva: nenhuma
-- coluna existente muda, nenhum dado é apagado.

alter table public.client_whatsapp_connections
  add column if not exists business_app_contacts_sync_at timestamptz,
  add column if not exists business_app_history_sync_at timestamptz,
  add column if not exists business_app_synced_at timestamptz;

comment on column public.client_whatsapp_connections.business_app_synced_at is
  'Quando as duas sincronizações do aplicativo WhatsApp Business foram pedidas à Meta (Coexistence).';

create or replace function public.meta_record_business_app_sync(
  p_client_id uuid,
  p_contacts_requested boolean,
  p_history_requested boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  -- Chamada só quando houve pedido nesta conexão. Grava a data atual (e não a
  -- de uma conexão anterior): numa reconexão com outro número, o registro
  -- antigo não pode valer para o novo.
  update public.client_whatsapp_connections as connection
  set business_app_contacts_sync_at = case
        when p_contacts_requested then now()
        else connection.business_app_contacts_sync_at
      end,
      business_app_history_sync_at = case
        when p_history_requested then now()
        else connection.business_app_history_sync_at
      end,
      -- Concluído só quando os DOIS pedidos foram aceitos nesta conexão; um
      -- pedido parcial deixa em aberto para a próxima reconexão tentar de novo.
      business_app_synced_at = case
        when p_contacts_requested and p_history_requested then now()
        else null
      end,
      atualizado_em = now()
  where connection.client_id = p_client_id;
end;
$$;

revoke all on function public.meta_record_business_app_sync(uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.meta_record_business_app_sync(uuid, boolean, boolean)
  to service_role;
