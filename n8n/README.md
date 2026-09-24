# Workflow WAHA do Atendimento por IA

Este diretório tem **um** workflow: o do Atendimento por IA.

Os fluxos de Conversões saíram daqui. A ingestão de leads passou a ser o webhook
oficial da Meta e o envio à Conversions API virou uma fila dentro da própria
aplicação. Veja [a documentação de Conversões](../docs/conversoes-whatsapp-meta.md).

Se os workflows `WAHA - Ingestao de Leads e Status de Sessao` e
`CAPI - Envio de Conversoes` ainda estiverem ativos no seu n8n, **pause os dois**
depois de publicar a versão nova. O campo "Webhook de produção do n8n para
leads" deixou de existir em Admin → Configurações, e a migração o remove da
configuração salva do WAHA — o WAHA para de entregar mensagens para aquele
endereço sozinho.

O status da sessão WAHA continua chegando direto na aplicação, em
`/whatsapp/webhook`; não dependia do n8n.

## Atendimento IA

`n8n_waha_atendimento_ia.json` é o fluxo que dá **tempo** ao atendimento por IA.
Ele não conhece prompt, plano nem lead: toda a regra de negócio fica no
dashboard. O n8n só espera e chama de volta — que é justamente o que a app,
rodando em serverless, não consegue fazer sozinha.

```text
WAHA (evento message)
  -> Webhook Atendimento IA           (responde 200 na hora)
  -> Preparar evento                  (reduz o payload ao mínimo)
  -> Mensagem do lead?                (descarta fromMe, grupo e mensagem vazia)
  -> POST /whatsapp/ia/evento         (grava a mensagem, idempotente)
  -> Agrupar mensagens (debounce)     (espera o tempo que a app mandou)
  -> POST /whatsapp/ia/passo          (gera a resposta / liga "digitando" / envia)
  -> Tem próximo passo?               (volta ao passo enquanto houver fila)
```

Cada chamada de `/whatsapp/ia/passo` avança **um** passo e devolve
`{ "acao": "aguardar", "esperarMs": 2840, "sessionName": "...", "chatId": "..." }`
ou `{ "acao": "fim" }`. O laço tem corte em 40 iterações por segurança.

Para instalar:

1. Importe o arquivo e selecione, nos dois nós HTTP, uma credencial
   **Header Auth** com Name `x-trafegoacademy-secret` e Value igual ao segredo
   salvo em Admin → Configurações → WhatsApp (WAHA).
2. Troque `https://dashboard.trafegoacademy.online` pela URL real do dashboard
   nos nós `Registrar mensagem no dashboard` e `Avancar conversa`, se for
   diferente.
3. Ative o workflow e copie a URL de produção do webhook `waha-atendimento-ia`.
4. Cole em Admin → Configurações → WhatsApp (WAHA) → **Webhook de produção do
   n8n para o Atendimento IA** e salve.
5. Peça ao cliente para clicar em conectar novamente. A rota `/whatsapp/conectar`
   atualiza os webhooks da sessão existente sem exigir um novo QR.

Mantenha `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`; este workflow não precisa de
acesso a `$env`. Ele desativa a persistência de dados de execução para não
gravar conversas de WhatsApp no histórico do n8n. Mantenha o n8n em HTTPS e
nunca coloque a `service_role` em nós, URLs, credenciais compartilhadas ou no
navegador.

Em Admin → Configurações, o card **DeepSeek** guarda o modelo e a API Key usados
nas conversas. A chave fica no banco e só é lida pelo servidor.
