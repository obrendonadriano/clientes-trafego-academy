# Workflows WAHA e Meta CAPI

Importe os dois arquivos JSON no n8n e configure estas variáveis no processo do n8n:

- `SUPABASE_URL`: `https://jqvwhonmtpopvldguiln.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta `service_role` do projeto TrafegoAcademy
- `WAHA_WEBHOOK_SECRET`: o mesmo segredo salvo em Admin → Configurações → WhatsApp (WAHA)

Depois:

1. Ative `WAHA - Ingestao de Leads e Status de Sessao` e copie a URL de produção do webhook `waha-eventos`.
2. Cole essa URL em Admin → Configurações → WhatsApp (WAHA) → Webhook de produção do n8n para leads.
3. Salve a integração e peça ao cliente para clicar em conectar novamente. A rota atualiza os webhooks da sessão WAHA existente sem exigir um novo QR quando ela já está ativa.
4. Ative `CAPI - Envio de Conversoes (Trafego Academy)`.

Os workflows desativam a persistência de dados de execução para não gravar tokens ou payloads de WhatsApp no histórico do n8n. Mantenha o n8n em HTTPS e nunca coloque a `service_role` em nós, URLs, credenciais compartilhadas ou no navegador.

O fluxo CAPI usa uma reserva atômica da fila, `event_id` determinístico e retentativas com backoff. O payload de WhatsApp envia `LeadSubmitted`, `ctwa_clid` sem hash e `whatsapp_business_account_id` para o Dataset do cliente correto.
