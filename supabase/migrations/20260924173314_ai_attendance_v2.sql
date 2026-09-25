-- Additive, AI-only. Do not apply before stopping the old AI workflow.
alter type public.ai_message_status add value if not exists 'cancelled';
alter type public.ai_message_status add value if not exists 'handled_by_human';
alter type public.ai_message_status add value if not exists 'processing_failed';
alter type public.ai_message_status add value if not exists 'sending';
alter type public.ai_message_status add value if not exists 'delivery_unknown';

alter table public.ai_agent_settings
  add column knowledge jsonb not null default '{}',
  add column business_schedule jsonb not null default '{"weekdays":[1,2,3,4,5],"start":"09:00","end":"18:00","timezone":"America/Sao_Paulo","offHoursMessage":"Recebi sua mensagem. Nosso atendimento está fora do horário agora; a equipe retorna no próximo período de atendimento."}';
alter table public.ai_conversations
  add column handoff_pending boolean not null default false,
  add column revision bigint not null default 0,
  add column processing_state text not null default 'idle' check (processing_state in ('idle','debouncing','generating','typing','human','error')),
  add column committed_revision bigint not null default -1,
  add column lease_token uuid,
  add column ai_resumed_at timestamptz,
  add column whatsapp_display_name text,
  add column last_question text,
  add column off_hours_period text,
  add column notification_state text not null default 'pending' check (notification_state in ('pending','sending','sent','uncertain'));
alter table public.ai_messages
  add column revision bigint not null default 0,
  add column sender_type text check (sender_type in ('lead','ai','human')),
  add column media_kind text not null default 'text' check (media_kind in ('text','audio','image','document')),
  add column source_at timestamptz,
  add column question_field text,
  add column closed_period text;
-- Preserve old names and status verbatim; their provenance cannot be reconstructed.
update public.ai_messages set sender_type = case when direction = 'inbound' then 'lead' else 'ai' end;
alter table public.ai_messages alter column sender_type set not null;
alter table public.ai_messages alter column sender_type set default 'lead';
drop index public.ai_messages_provider_message_id_key;
create unique index ai_messages_tenant_provider_key on public.ai_messages(client_id, provider_message_id) where provider_message_id is not null;

create table public.ai_processing_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  revision bigint not null, event_type text not null, policy_decision text,
  model text, latency_ms integer, error_code text, extracted_fields text[] not null default '{}',
  actor_id uuid, created_at timestamptz not null default now()
);
create index ai_processing_events_recent on public.ai_processing_events(client_id, conversation_id, created_at desc);
alter table public.ai_processing_events enable row level security;
create policy ai_events_read on public.ai_processing_events for select to authenticated using (
  exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.ativo and (u.role='admin' or u.client_id=ai_processing_events.client_id))
);
revoke all on public.ai_processing_events from public, anon, authenticated;
grant select on public.ai_processing_events to authenticated;
grant all on public.ai_processing_events to service_role;

-- fromMe can precede the HTTP send response containing its provider ID.
create table public.ai_pending_echoes (
  client_id uuid not null references public.clients(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  provider_message_id text not null, body text not null, created_at timestamptz not null default now(),
  primary key(client_id, provider_message_id)
);
alter table public.ai_pending_echoes enable row level security;
revoke all on public.ai_pending_echoes from public, anon, authenticated;
grant all on public.ai_pending_echoes to service_role;

-- All state transitions lock the conversation, including inbound events. The
-- application never holds a DB transaction open across a model/network call.
create function public.ai_v2_transition(p_client_id uuid, p_action text, p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c public.ai_conversations%rowtype;
  m public.ai_messages%rowtype;
  s public.ai_agent_settings%rowtype;
  v_active boolean;
  v_id uuid;
  v_token uuid := nullif(p_data->>'token','')::uuid;
  v_revision bigint := (p_data->>'revision')::bigint;
  v_status public.ai_message_status;
  v_human boolean;
  v_policy text;
  v_patch jsonb;
  v_part jsonb;
  v_index integer := 0;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select * into s from public.ai_agent_settings where client_id=p_client_id;
  select coalesce(s.enabled,false) and plan_type='complete' into v_active from public.clients where id=p_client_id;
  v_active := coalesce(v_active,false);
  if p_action='ingest' then
    if not exists(select 1 from public.ai_conversations where client_id=p_client_id and whatsapp_number=p_data->>'number') and not v_active then
      return '{"ok":false}';
    end if;
    insert into public.ai_conversations(client_id,whatsapp_number,chat_id,whatsapp_display_name)
      values(p_client_id,p_data->>'number',p_data->>'chatId',p_data->>'displayName')
      on conflict(client_id,whatsapp_number) do nothing;
    select * into c from public.ai_conversations where client_id=p_client_id and whatsapp_number=p_data->>'number' for update;
  else
    select * into c from public.ai_conversations where client_id=p_client_id and id=(p_data->>'conversationId')::uuid for update;
  end if;
  if c.id is null then return '{"ok":false}'; end if;

  if p_action='ingest' then
    if nullif(p_data->>'messageId','') is null then return '{"ok":false}'; end if;
    if exists(select 1 from public.ai_messages where client_id=p_client_id and provider_message_id=p_data->>'messageId') then
      return jsonb_build_object('ok',true,'duplicate',true,'conversationId',c.id,'schedule',v_active and not c.human_takeover);
    end if;
    if (p_data->>'fromMe')::boolean and exists(select 1 from public.ai_messages where conversation_id=c.id and status='sending') then
      insert into public.ai_pending_echoes(client_id,conversation_id,provider_message_id,body)
        values(p_client_id,c.id,p_data->>'messageId',p_data->>'body') on conflict do nothing;
      return jsonb_build_object('ok',true,'schedule',true,'conversationId',c.id);
    end if;
    if (p_data->>'fromMe')::boolean then
      insert into public.ai_messages(client_id,conversation_id,direction,status,sender_type,body,provider_message_id,revision,sent_at)
        values(p_client_id,c.id,'outbound','sent','human',p_data->>'body',p_data->>'messageId',c.revision+1,now());
      p_action := 'takeover'; p_data := p_data || '{"human":true}';
    else
      v_status := case when c.human_takeover or c.handoff_pending then 'handled_by_human' when not v_active then 'ignored'
        when c.ai_resumed_at is not null and nullif(p_data->>'sourceAt','')::timestamptz <= c.ai_resumed_at then 'handled_by_human' else 'received' end;
      insert into public.ai_messages(client_id,conversation_id,direction,status,sender_type,body,provider_message_id,revision,media_kind,source_at)
        values(p_client_id,c.id,'inbound',v_status,'lead',p_data->>'body',p_data->>'messageId',c.revision+1,coalesce(p_data->>'mediaKind','text'),nullif(p_data->>'sourceAt','')::timestamptz);
      update public.ai_messages set status='cancelled' where conversation_id=c.id and status in ('queued','typing');
      update public.ai_conversations set revision=revision+1,last_inbound_at=now(),
        human_takeover=human_takeover or handoff_pending,handoff_pending=false,
        whatsapp_display_name=coalesce(nullif(p_data->>'displayName',''),whatsapp_display_name),
        processing_state=case when human_takeover or handoff_pending then 'human' when v_status='received' then 'debouncing' else 'idle' end
        where id=c.id;
      insert into public.ai_processing_events(client_id,conversation_id,revision,event_type) values(p_client_id,c.id,c.revision+1,'inbound');
      return jsonb_build_object('ok',true,'conversationId',c.id,'schedule',v_status='received','stopTyping',true);
    end if;
  end if;

  if p_action='reconcile' then
    if exists(select 1 from public.ai_messages where conversation_id=c.id and status='sending' and typing_started_at > now()-interval '45 seconds') then
      return '{"ok":false,"busy":true}';
    end if;
    -- A process died during send: do not retry a potentially delivered message.
    update public.ai_messages set status='delivery_unknown' where conversation_id=c.id and status='sending';
    if found then
      update public.ai_conversations set last_error='delivery_unknown', processing_state='error', human_takeover=true where id=c.id;
      update public.ai_messages set status='cancelled' where conversation_id=c.id and status in ('queued','typing');
      update public.ai_messages set status='handled_by_human' where conversation_id=c.id and status='received';
    end if;
    insert into public.ai_messages(client_id,conversation_id,direction,status,sender_type,body,provider_message_id,revision,sent_at)
      select e.client_id,e.conversation_id,'outbound','sent','human',e.body,e.provider_message_id,c.revision+1,e.created_at
      from public.ai_pending_echoes e where e.conversation_id=c.id
        and not exists(select 1 from public.ai_messages x where x.client_id=e.client_id and x.provider_message_id=e.provider_message_id)
      on conflict do nothing;
    v_human := found;
    delete from public.ai_pending_echoes where conversation_id=c.id;
    if v_human then p_action:='takeover'; p_data:=p_data || '{"human":true}';
    else return '{"ok":true}'; end if;
  end if;

  if p_action='takeover' then
    v_human := (p_data->>'human')::boolean;
    if not v_human and not exists(select 1 from public.clients where id=p_client_id and plan_type='complete') then return '{"ok":false}'; end if;
    update public.ai_messages set status='cancelled' where conversation_id=c.id and status in ('queued','typing');
    update public.ai_messages set status='handled_by_human' where conversation_id=c.id and status in ('received','processing_failed');
    update public.ai_conversations set human_takeover=v_human,handoff_pending=false,human_takeover_requested=false,revision=revision+1,
      processing_state=case when v_human then 'human' else 'idle' end,
      ai_resumed_at=case when v_human then ai_resumed_at else now() end,
      last_error=case when v_human then last_error else null end
      where id=c.id;
    insert into public.ai_processing_events(client_id,conversation_id,revision,event_type,actor_id)
      values(p_client_id,c.id,c.revision+1,case when v_human then 'human_takeover' else 'ai_resumed' end,nullif(p_data->>'actorId','')::uuid);
    return jsonb_build_object('ok',true,'stopTyping',true,'conversationId',c.id);
  end if;

  if p_action='claim' then
    if not v_active or c.human_takeover or (c.lease_token is not null and c.processing_claimed_at > now()-interval '180 seconds') then return '{"ok":false}'; end if;
    update public.ai_conversations set lease_token=v_token,processing_claimed_at=now() where id=c.id;
    return jsonb_build_object('ok',true,'revision',c.revision);
  end if;
  if p_action='release' then
    update public.ai_conversations set lease_token=null,processing_claimed_at=null where id=c.id and lease_token=v_token;
    return '{"ok":true}';
  end if;
  if p_action='sent' then
    -- Acknowledgements must persist even if an inbound/takeover raced the send.
    update public.ai_messages set status='sent',sent_at=now(),provider_message_id=nullif(p_data->>'providerId','')
      where id=(p_data->>'messageId')::uuid and conversation_id=c.id and status='sending' returning * into m;
    if not found then return '{"ok":false}'; end if;
    delete from public.ai_pending_echoes where conversation_id=c.id and provider_message_id=p_data->>'providerId';
    update public.ai_conversations set last_outbound_at=now(),last_question=coalesce(m.question_field,last_question),off_hours_period=coalesce(m.closed_period,off_hours_period),human_takeover=human_takeover or handoff_pending,
      processing_state=case when human_takeover or handoff_pending then 'human' else 'idle' end,handoff_pending=false where id=c.id;
    return '{"ok":true}';
  end if;
  if p_action='send_failed' then
    update public.ai_messages set status='delivery_unknown' where id=(p_data->>'messageId')::uuid and conversation_id=c.id and status='sending';
    update public.ai_messages set status='cancelled' where conversation_id=c.id and status in ('queued','typing');
    update public.ai_conversations set human_takeover=true,processing_state='error',last_error='delivery_unknown' where id=c.id;
    insert into public.ai_processing_events(client_id,conversation_id,revision,event_type,error_code) values(p_client_id,c.id,c.revision,'send_failed','delivery_unknown');
    return '{"ok":true}';
  end if;
  if p_action='notify_result' then
    update public.ai_conversations set notification_state=case when (p_data->>'success')::boolean then 'sent' else 'uncertain' end,
      notification_sent=(p_data->>'success')::boolean,notification_sent_at=case when (p_data->>'success')::boolean then now() else null end,
      last_error=case when (p_data->>'success')::boolean then last_error else 'notification_unknown' end
      where id=c.id and notification_state='sending';
    return '{"ok":true}';
  end if;
  if p_action='notify_claim' then
    if not v_active or c.status <> 'qualified' or c.notification_sent or c.notification_state <> 'pending' or not s.notify_qualified or s.notification_whatsapp is null
      or not exists(select 1 from public.ai_processing_events where conversation_id=c.id and policy_decision='policy_qualified') then return '{"ok":false}'; end if;
    update public.ai_conversations set notification_state='sending' where id=c.id;
    return '{"ok":true}';
  end if;

  -- Lease owner and revision are checked again at every mutation/send gate.
  if not v_active or c.human_takeover or c.lease_token is distinct from v_token or c.revision is distinct from v_revision
    or c.processing_claimed_at < now()-interval '180 seconds' then return '{"ok":false,"stale":true}'; end if;
  if p_action='generating' then
    update public.ai_conversations set processing_state='generating' where id=c.id;
    return '{"ok":true}';
  elsif p_action='cancel_pending' then
    update public.ai_messages set status='cancelled' where conversation_id=c.id and status in ('queued','typing');
    update public.ai_conversations set processing_state='idle' where id=c.id;
    return '{"ok":true}';
  elsif p_action='fail' then
    update public.ai_messages set status='processing_failed' where conversation_id=c.id and status='received' and revision<=v_revision;
    update public.ai_conversations set processing_state='error',human_takeover=true,last_error='processing_failed' where id=c.id;
    insert into public.ai_processing_events(client_id,conversation_id,revision,event_type,error_code) values(p_client_id,c.id,c.revision,'processing_failed','model_unavailable');
    return '{"ok":true}';
  elsif p_action='commit' then
    if c.committed_revision=c.revision then return '{"ok":false,"duplicate":true}'; end if;
    v_patch:=p_data->'facts'; v_policy:=p_data->>'reason';
    if jsonb_array_length(p_data->'messages')>2 then raise exception 'Too many messages'; end if;
    update public.ai_conversations set committed_revision=c.revision,
      name=case when v_patch is null then name else v_patch->>'name' end,
      vehicle=case when v_patch is null then vehicle else v_patch->>'vehicle' end,
      vehicle_year=case when v_patch is null then vehicle_year else (v_patch->>'vehicle_year')::integer end,
      financed=case when v_patch is null then financed else (v_patch->>'financed')::boolean end,
      bank=case when v_patch is null then bank else v_patch->>'bank' end,
      debt_amount=case when v_patch is null then debt_amount else (v_patch->>'debt_amount')::numeric end,
      has_overdue_installments=case when v_patch is null then has_overdue_installments else (v_patch->>'has_overdue_installments')::boolean end,
      overdue_installments_count=case when v_patch is null then overdue_installments_count else (v_patch->>'overdue_installments_count')::integer end,
      unknown_fields=case when p_data ? 'unknown' then array(select jsonb_array_elements_text(p_data->'unknown')) else unknown_fields end,
      status=coalesce((p_data->>'status')::public.ai_lead_status,status),
      qualified_at=case when p_data->>'status'='qualified' then coalesce(qualified_at,now()) else qualified_at end,
      disqualification_reason=case when p_data->>'status'='disqualified' then 'Veículo não financiado.' when p_data ? 'status' then null else disqualification_reason end,
      handoff_pending=coalesce((p_data->>'human')::boolean,false),human_takeover_requested=coalesce((p_data->>'human')::boolean,false),
      processing_state=case when (p_data->>'human')::boolean then 'human' else 'idle' end,last_error=null
      where id=c.id;
    update public.ai_messages set status=case when (p_data->>'human')::boolean then 'handled_by_human'::public.ai_message_status else 'processed'::public.ai_message_status end
      where conversation_id=c.id and status='received' and revision<=v_revision;
    -- A requested handoff gets one acknowledgement; panel/manual takeover always cancels it.
    if not (p_data ? 'closedPeriod') or c.off_hours_period is distinct from p_data->>'closedPeriod' then
      for v_part in select * from jsonb_array_elements(p_data->'messages') loop
        insert into public.ai_messages(client_id,conversation_id,direction,status,sender_type,body,revision,run_id,sequence,delay_ms,typing_started_at,question_field,closed_period)
          values(p_client_id,c.id,'outbound','queued','ai',v_part->>'body',c.revision,(p_data->>'runId')::uuid,v_index,(v_part->>'delayMs')::integer,
            case when v_index=0 then nullif(p_data->>'startedAt','')::timestamptz else null end,
            p_data->>'nextField',p_data->>'closedPeriod');
        v_index:=v_index+1;
      end loop;
    end if;
    insert into public.ai_processing_events(client_id,conversation_id,revision,event_type,policy_decision,model,latency_ms,extracted_fields)
      values(p_client_id,c.id,c.revision,'turn_committed',left(v_policy,80),left(p_data->>'model',100),(p_data->>'latencyMs')::integer,
        array(select jsonb_array_elements_text(coalesce(p_data->'changedFields','[]'))));
    return '{"ok":true}';
  elsif p_action in ('typing','send') then
    select * into m from public.ai_messages where conversation_id=c.id and id=(p_data->>'messageId')::uuid for update;
    if m.id is null or m.revision<>c.revision or m.status not in ('queued','typing') or exists(select 1 from public.ai_pending_echoes where conversation_id=c.id) then return '{"ok":false}'; end if;
    if p_action='send' and (m.typing_started_at is null or now()<m.typing_started_at+make_interval(secs=>m.delay_ms/1000.0)) then return '{"ok":false}'; end if;
    update public.ai_messages set status=case when p_action='send' then 'sending'::public.ai_message_status else 'typing'::public.ai_message_status end,
      typing_started_at=case when p_action='send' then now() else coalesce(typing_started_at,now()) end where id=m.id;
    update public.ai_conversations set processing_state='typing' where id=c.id;
    return '{"ok":true}';
  elsif p_action='idle' then
    update public.ai_conversations set processing_state='idle' where id=c.id;
    return '{"ok":true}';
  end if;
  raise exception 'Unknown AI action';
end;
$$;
revoke all on function public.ai_v2_transition(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ai_v2_transition(uuid,text,jsonb) to service_role;

-- Disabling (including the existing downgrade trigger) invalidates any old work.
create function public.ai_v2_disable_pending() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.enabled and not new.enabled then
    update public.ai_conversations set revision=revision+1,processing_state=case when human_takeover then 'human' else 'idle' end,handoff_pending=false where client_id=new.client_id;
    update public.ai_messages set status='cancelled' where client_id=new.client_id and status in ('queued','typing');
    update public.ai_messages set status='ignored' where client_id=new.client_id and status='received';
  end if;
  return new;
end;
$$;
revoke all on function public.ai_v2_disable_pending() from public,anon,authenticated;
create trigger ai_v2_disable_pending after update of enabled on public.ai_agent_settings for each row execute function public.ai_v2_disable_pending();
