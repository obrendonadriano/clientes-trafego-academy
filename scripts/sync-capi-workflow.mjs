import { readFile, writeFile } from 'node:fs/promises';
const path = new URL('../n8n/n8n_capi_conversoes.json', import.meta.url);
const workflow = JSON.parse(await readFile(path, 'utf8'));
const node = (name) => workflow.nodes.find((item) => item.name === name);
node('Montar payload CAPI').parameters.jsCode = await readFile(new URL('../n8n/code/build-conversion-payload.js', import.meta.url), 'utf8');
node('Ler resposta do Meta').parameters.jsCode = await readFile(new URL('../n8n/code/read-conversion-response.js', import.meta.url), 'utf8');
node('Gravar resultado no Supabase').parameters.jsonBody = '={{ JSON.stringify({ p_lead_id: $json.lead_id, p_event_id: $json.event_id, p_ok: $json.ok, p_resposta: $json.resposta, p_retryable: $json.retryable }) }}';
node('Enviar para Meta CAPI').retryOnFail = false;
// Queue claim is also non-idempotent: a lost response needs reconciliation.
node('Buscar fila no Supabase').retryOnFail = false;
workflow.nodes = workflow.nodes.filter((item) => item.name !== 'Aplicar identificadores WhatsApp');
workflow.connections['Montar payload CAPI'] = { main: [[{ node: 'Um lead por vez', type: 'main', index: 0 }]] };
delete workflow.connections['Aplicar identificadores WhatsApp'];
await writeFile(path, `${JSON.stringify(workflow, null, 2)}\n`);
