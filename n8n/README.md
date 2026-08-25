# Workflows WAHA e Meta CAPI

Importe os dois arquivos JSON no n8n. Os fluxos não acessam variáveis de ambiente: os segredos ficam nas credenciais criptografadas do próprio n8n.

- Crie ou reutilize uma credencial **Supabase API** com o host `https://jqvwhonmtpopvldguiln.supabase.co` e a chave secreta do projeto TrafegoAcademy. Selecione-a nos quatro nós HTTP do Supabase: `Gravar lead no Supabase`, `Atualizar status no Supabase`, `Buscar fila no Supabase` e `Gravar resultado no Supabase`.
- Crie ou reutilize uma credencial **Header Auth** com Name `x-trafegoacademy-secret` e Value igual ao segredo salvo em Admin → Configurações → WhatsApp (WAHA). Selecione-a no nó `Webhook WAHA`.
- Mantenha `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`; estes workflows não precisam de acesso a `$env`.

Depois:

1. Selecione as credenciais indicadas nos nós importados. O n8n não inclui IDs nem valores de credenciais no arquivo exportado.
2. Ative `WAHA - Ingestao de Leads e Status de Sessao` e copie a URL de produção do webhook `waha-eventos`.
3. Cole essa URL em Admin → Configurações → WhatsApp (WAHA) → Webhook de produção do n8n para leads.
4. Salve a integração e peça ao cliente para clicar em conectar novamente. A rota atualiza os webhooks da sessão WAHA existente sem exigir um novo QR quando ela já está ativa.
5. Ative `CAPI - Envio de Conversoes (Trafego Academy)`.

Os workflows desativam a persistência de dados de execução para não gravar tokens ou payloads de WhatsApp no histórico do n8n. Mantenha o n8n em HTTPS e nunca coloque a `service_role` diretamente em nós, URLs, credenciais compartilhadas ou no navegador.

O fluxo CAPI usa uma reserva atômica da fila, `event_id` determinístico e retentativas com backoff. O payload de WhatsApp envia `LeadSubmitted`, `ctwa_clid` sem hash e `whatsapp_business_account_id` para o Dataset do cliente correto.
