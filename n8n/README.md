# Workflows n8n

Três arquivos, em dois estados diferentes.

## Em transição (LEGADO)

`[LEGADO] n8n_waha_ingestao.json` e `[LEGADO] n8n_capi_conversoes.json` são o
pipeline antigo de Conversões. Eles **continuam necessários** enquanto houver
cliente em `conversion_ingest_mode = 'legacy_waha'`.

**Não desative e não apague ainda.** Fazer isso agora interrompe a captação de
leads de todos os clientes que ainda não conectaram o WhatsApp Business
oficial. A ordem correta está no
[roteiro de implantação](../docs/conversoes-whatsapp-meta.md).

O que muda no comportamento deles: um cliente já migrado para `official_meta` é
ignorado dentro de `waha_ingest_lead`, no banco — o workflow não precisa saber
de nada. Isso evita que a mesma conversa entre duas vezes durante a fase
híbrida.

O `[LEGADO] CAPI` pode conviver com o worker da aplicação: os dois consomem a
mesma fila com reserva atômica (`SKIP LOCKED`), então um evento nunca é enviado
em duplicidade. Ao ligar `CONVERSIONS_DISPATCHER_ENABLED=true`, desative este
workflow para simplificar o diagnóstico.

Se editar os arquivos em `n8n/code`, rode `node scripts/sync-capi-workflow.mjs`
antes de importar o JSON. Há teste garantindo que o workflow e os arquivos não
divergem.

Quando **todos** os clientes estiverem em `official_meta`, a segunda migração
remove tudo isto do repositório.

## Permanente

`n8n_waha_atendimento_ia.json` é do Atendimento por IA e **não** é legado. Ele
não tem relação com Conversões e continua ativo o tempo todo.

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
