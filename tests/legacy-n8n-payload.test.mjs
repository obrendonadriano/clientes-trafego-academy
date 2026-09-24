// LEGADO / TRANSITÓRIO: cobre o workflow n8n de CAPI enquanto ele existir.
// Ele consome a MESMA fila do worker da aplicação, com reserva atômica no
// banco, então os dois podem coexistir sem enviar o evento duas vezes.
// Este arquivo sai junto com a migração de cleanup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
// O checkout no Windows converte para CRLF; o JSON guarda LF. A diferença é
// do sistema de arquivos, não do código, então a comparação normaliza.
const lf = (text) => text.split('\r\n').join('\n');
const build = lf(readFileSync(new URL('../n8n/code/build-conversion-payload.js', import.meta.url), 'utf8'));
const response = lf(readFileSync(new URL('../n8n/code/read-conversion-response.js', import.meta.url), 'utf8'));
const run = (code, context) => JSON.parse(JSON.stringify(vm.runInNewContext(`(function(){${code}\n})()`, context)));
const fixture = { lead_id:'lead', dataset_id:'dataset', event_id:'stable-event', event_name:'QualifiedLead', event_time:1000000000, action_source:'business_messaging', user_data:{ctwa_clid:'click',whatsapp_business_account_id:'waba'}, access_token:'test' };
test('payload preserves real timestamps and only sends appropriate channel identifiers', () => {
  const output = run(build, {$input:{all:()=>[{json:fixture}]}})[0].json.corpo.data[0];
  assert.equal(output.event_time,fixture.event_time);
  assert.equal(output.messaging_channel,'whatsapp');
  const offline = {...fixture,event_name:'VehicleAcquired',action_source:'other',user_data:{ph:['a'.repeat(64)]},valor:25000,observacao:'private'};
  const result = run(build, {$input:{all:()=>[{json:offline}]}})[0].json.corpo.data[0];
  assert.equal(result.messaging_channel,undefined);
  assert.equal(result.custom_data,undefined);
  assert.equal(result.user_data.ctwa_clid,undefined);
  assert.equal(JSON.stringify(result).includes('private'),false);
  assert.throws(()=>run(build,{$input:{all:()=>[{json:{...fixture,event_name:'Purchase'}}]}}));
});
test('only acknowledged acceptance is success; ambiguous failures never auto-retry', () => {
  const interpret = (resp) => run(response,{$json:resp,$:()=>({item:{json:fixture}})})[0].json;
  assert.equal(interpret({statusCode:200,body:{events_received:1}}).ok,true);
  assert.equal(interpret({statusCode:200,body:{events_received:0}}).ok,false);
  assert.equal(interpret({statusCode:429,body:{error:{code:4}}}).retryable,true);
  assert.equal(interpret({error:{message:'timeout'}}).retryable,false);
  assert.equal(interpret({statusCode:503,body:{error:{is_transient:true}}}).retryable,false);
});
test('importable workflow embeds tested code and does not retry Meta blindly', () => {
  const flow = JSON.parse(readFileSync(new URL('../n8n/n8n_capi_conversoes.json',import.meta.url),'utf8'));
  assert.equal(lf(flow.nodes.find((n)=>n.name==='Montar payload CAPI').parameters.jsCode),build);
  assert.equal(lf(flow.nodes.find((n)=>n.name==='Ler resposta do Meta').parameters.jsCode),response);
  assert.equal(flow.nodes.find((n)=>n.name==='Enviar para Meta CAPI').retryOnFail,false);
});
