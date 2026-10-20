-- Evento de teste da Conversions API com a credencial salva do cliente.
--
-- O admin envia UM evento ao Test Events do Dataset (test_event_code) antes de
-- ligar o envio de verdade. Esta função entrega ao servidor só o necessário:
-- Dataset, WABA, a credencial (ainda cifrada; o servidor decifra) e o
-- ctwa_clid do lead mais recente do cliente, porque o evento de Business
-- Messaging exige um clique real.
--
-- Migração só aditiva: uma função NOVA. Não lê nem altera a fila
-- (private.conversion_events), não muda nenhuma função, tabela ou política
-- existente. Executável apenas por service_role.

create or replace function public.admin_capi_test_target(p_client_id uuid)
returns table (
  dataset_id text,
  waba_id text,
  access_token text,
  credential_source text,
  ctwa_clid text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(connection.dataset_id, c.meta_dataset_id),
    coalesce(connection.waba_id, c.meta_waba_id),
    coalesce(official.access_token, legacy.access_token),
    case
      when official.access_token is not null then 'official'
      when legacy.access_token is not null then 'legacy'
    end,
    (
      select l.ctwa_clid
      from public.conversion_leads l
      where l.client_id = c.id
        and nullif(btrim(l.ctwa_clid), '') is not null
      order by l.criado_em desc
      limit 1
    )
  from public.clients c
  left join public.client_whatsapp_connections connection on connection.client_id = c.id
  left join private.client_whatsapp_credentials official on official.client_id = c.id
  left join private.client_capi_credentials legacy on legacy.client_id = c.id
  where c.id = p_client_id;
$$;

revoke all on function public.admin_capi_test_target(uuid) from public, anon, authenticated;
grant execute on function public.admin_capi_test_target(uuid) to service_role;
