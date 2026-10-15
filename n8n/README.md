# Workflows n8n

Dois arquivos, ambos legados de Conversões.

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

## Atendimento IA — fora do n8n (2026-10)

O Atendimento por IA **não usa mais o n8n**; o workflow e as rotas
`/whatsapp/ia/evento` e `/whatsapp/ia/passo` foram removidos. O WAHA chama o
site direto em `/whatsapp/ia/waha` (evento `message.any`) e a espera
(agrupamento, "digitando", intervalos) roda na própria função com `after()`
— ver `src/lib/ai-agent/runner.ts`. Só clientes do segmento
`veiculo_atrasado` recebem esse webhook.

Para migrar as sessões existentes: Admin → Configurações → WAHA →
**Atualizar webhooks de todas as sessões** (ou o cliente clica em conectar).
Depois, apague o workflow de Atendimento IA no painel do n8n.
