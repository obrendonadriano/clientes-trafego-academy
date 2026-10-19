-- WhatsApp de notificação do Atendimento IA aceita números de outros países.
--
-- Antes só valia telefone brasileiro (55 + DDD + 8/9 dígitos). Agora vale o
-- formato internacional E.164 sem o "+": código do país + número, de 8 a 15
-- dígitos no total. A validação por país (quantidade de dígitos, DDD) é feita
-- no servidor antes de gravar; aqui fica só a trava de formato.
-- Todo número brasileiro já salvo continua válido.

alter table public.ai_agent_settings
  drop constraint if exists ai_agent_settings_notification_check;

alter table public.ai_agent_settings
  add constraint ai_agent_settings_notification_check check (
    notification_whatsapp is null
    or notification_whatsapp ~ '^[1-9][0-9]{7,14}$'
  );
