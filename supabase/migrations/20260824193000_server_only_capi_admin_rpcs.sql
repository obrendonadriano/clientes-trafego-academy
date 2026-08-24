-- CAPI administration is performed by authenticated Next.js server code using
-- the service role. The browser never receives EXECUTE on secret-handling RPCs.

create or replace function public.admin_clear_client_capi_token(p_client_id uuid)
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

  delete from private.client_capi_credentials
  where client_id = p_client_id;

  update public.clients
  set capi_ativo = false
  where id = p_client_id;
end;
$$;

create or replace function public.admin_client_capi_status()
returns table(
  client_id uuid,
  nome_empresa text,
  meta_dataset_id text,
  meta_waba_id text,
  capi_ativo boolean,
  token_configurado boolean,
  leads_pendentes bigint,
  leads_na_fila bigint
)
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

  return query
  select client.id,
         client.nome_empresa,
         client.meta_dataset_id,
         client.meta_waba_id,
         client.capi_ativo,
         credentials.client_id is not null,
         count(*) filter (where lead.qualificacao = 'pendente'),
         count(*) filter (
           where lead.qualificacao = 'qualificado'
             and lead.ctwa_clid is not null
             and lead.capi_status in ('nao_enviado', 'erro')
             and lead.capi_tentativas < 5
         )
  from public.clients as client
  left join private.client_capi_credentials as credentials
    on credentials.client_id = client.id
  left join public.conversion_leads as lead
    on lead.client_id = client.id
  group by client.id,
           client.nome_empresa,
           client.meta_dataset_id,
           client.meta_waba_id,
           client.capi_ativo,
           credentials.client_id
  order by client.nome_empresa;
end;
$$;

revoke all on function public.admin_set_client_capi_config(uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_client_capi_config(uuid, text, text, text, boolean)
  to service_role;

revoke all on function public.admin_client_capi_status()
  from public, anon, authenticated;
grant execute on function public.admin_client_capi_status() to service_role;

revoke all on function public.admin_clear_client_capi_token(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_clear_client_capi_token(uuid) to service_role;
