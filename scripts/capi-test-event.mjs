// Teste CONTROLADO de um evento da Conversions API no Test Events da Meta.
//
// Por que existe: a documentação oficial não é conclusiva sobre o Dataset
// criado pelo WABA (POST /{WABA_ID}/dataset) aceitar um evento PERSONALIZADO
// (VehicleAcquired) com action_source "other". Em vez de supor, este script
// envia UM evento de teste e mostra exatamente o que a Meta respondeu.
//
// Usa o MESMO montador de payload do dispatcher (src/lib/conversions/
// capi-payload.ts): o que é testado aqui é o que a produção enviaria.
//
// ATENÇÃO — documentação da Meta: "Events sent with test_event_code are not
// dropped. They flow into Events Manager and are used for targeting and ads
// measurement purposes." Ou seja, o teste conta na medição. Por isso:
//   - padrão é SIMULAÇÃO (só mostra o payload, não envia nada);
//   - enviar exige --send, --test-event-code e --confirm;
//   - VehicleAcquired nunca leva valor financeiro (o script recusa --value);
//   - o token vem de CAPI_TEST_ACCESS_TOKEN, vai só no cabeçalho e nunca é
//     impresso.
//
// Pré-requisito para enviar: token com whatsapp_business_manage_events
// (App Review separado para Conversões). Sem ela a Meta recusa por permissão.
//
// Exemplos:
//   # Simulação (não envia):
//   node scripts/capi-test-event.mjs --event VehicleAcquired --dataset 123 --phone 5514999990000
//
//   # Envio real ao Test Events (Events Manager > Data Sources > Dataset > Test Events):
//   CAPI_TEST_ACCESS_TOKEN=... node scripts/capi-test-event.mjs --event VehicleAcquired \
//     --dataset 123 --phone 5514999990000 --test-event-code TEST123 --send --confirm
//
//   # Eventos de Business Messaging (exigem um ctwa_clid real de um clique):
//   ... --event LeadSubmitted --dataset 123 --waba 456 --ctwa-clid ARxx...
//   ... --event Purchase --dataset 123 --waba 456 --ctwa-clid ARxx... --value 1500 --currency BRL

import { createHash } from 'node:crypto';
import {
  buildRequestBody,
  MESSAGING_EVENTS,
  OFFLINE_EVENTS,
  readMetaOutcome,
} from '../src/lib/conversions/capi-payload.ts';

// Mesmo padrão de src/lib/meta/conversions-config.ts (não importado aqui porque
// aquele módulo é server-only).
const DEFAULT_GRAPH_VERSION = 'v26.0';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// Igual ao SQL de produção: só dígitos, de 10 a 15, SHA-256 em hex.
function hashPhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    fail('--phone precisa ter de 10 a 15 dígitos, com DDI (ex.: 5514999990000).');
  }
  return createHash('sha256').update(digits, 'utf8').digest('hex');
}

const redact = (text) =>
  String(text)
    .replace(/Bearer\s+[A-Za-z0-9._\-|]+/gi, 'Bearer [removido]')
    .replace(/\bEA[A-Za-z0-9]{20,}\b/g, '[token removido]')
    .replace(/access_token=[^&\s"']+/gi, 'access_token=[removido]');

const args = parseArgs(process.argv.slice(2));
const eventName = args.event;
const datasetId = args.dataset;
const isOffline = OFFLINE_EVENTS.includes(eventName);
const isMessaging = MESSAGING_EVENTS.includes(eventName);

if (!isOffline && !isMessaging) {
  fail(`--event precisa ser um de: ${[...MESSAGING_EVENTS, ...OFFLINE_EVENTS].join(', ')}.`);
}

if (!/^\d{5,30}$/.test(String(datasetId ?? ''))) {
  fail('--dataset precisa ser o ID numérico do Dataset do cliente.');
}

if (eventName === 'VehicleAcquired' && (args.value !== undefined || args.currency !== undefined)) {
  // Valor pago pelo veículo é custo de aquisição, não receita. Nunca vai à Meta.
  fail('VehicleAcquired não aceita --value/--currency: o valor do veículo nunca é enviado.');
}

const now = Math.floor(Date.now() / 1000);
const row = {
  lead_id: 'teste-controlado',
  dataset_id: String(datasetId),
  waba_id: args.waba ? String(args.waba) : null,
  access_token: null,
  event_name: eventName,
  event_id: `teste-${eventName}-${now}`,
  event_time: now,
  action_source: isOffline ? 'other' : 'business_messaging',
  user_data: isOffline
    ? { ph: [hashPhone(args.phone)] }
    : {
        ctwa_clid: args['ctwa-clid'] ? String(args['ctwa-clid']) : undefined,
        whatsapp_business_account_id: args.waba ? String(args.waba) : undefined,
      },
  custom_data:
    eventName === 'Purchase'
      ? { value: Number(args.value), currency: String(args.currency ?? '') }
      : null,
};

let body;
try {
  body = buildRequestBody(row);
} catch (error) {
  fail(`Payload recusado antes do envio: ${error.message}`);
}

if (args['test-event-code']) {
  body.test_event_code = String(args['test-event-code']);
}

const version = /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION ?? '')
  ? process.env.META_GRAPH_VERSION
  : DEFAULT_GRAPH_VERSION;
const endpoint = `https://graph.facebook.com/${version}/${datasetId}/events`;

console.log(`\nEndpoint: POST ${endpoint}`);
console.log('Payload (sem token; telefone só em SHA-256):');
console.log(JSON.stringify(body, null, 2));

if (!args.send) {
  console.log('\nSIMULAÇÃO: nada foi enviado. Use --send --test-event-code <código> --confirm para enviar.\n');
  process.exit(0);
}

if (!body.test_event_code) {
  fail('Envio exige --test-event-code (Events Manager > Data Sources > Dataset > Test Events).');
}

if (!args.confirm) {
  fail('Envio exige --confirm: eventos de teste também entram na medição da Meta.');
}

const token = process.env.CAPI_TEST_ACCESS_TOKEN?.trim();
if (!token) {
  fail('Defina CAPI_TEST_ACCESS_TOKEN (token com whatsapp_business_manage_events). Ele não é impresso.');
}

let status = null;
let responseBody = null;
let networkError = null;

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  status = response.status;
  const text = await response.text();
  try {
    responseBody = text ? JSON.parse(text) : null;
  } catch {
    responseBody = { raw: text.slice(0, 500) };
  }
} catch (error) {
  networkError = error?.name === 'TimeoutError' ? 'tempo esgotado' : 'falha de rede';
}

const outcome = readMetaOutcome({ status, body: responseBody, networkError });
const error = responseBody?.error;

console.log('\nResultado:');
console.log(
  JSON.stringify(
    {
      httpStatus: status,
      aceito: outcome.ok,
      events_received: responseBody?.events_received ?? null,
      fbtrace_id: responseBody?.fbtrace_id ?? error?.fbtrace_id ?? null,
      metaCode: error?.code ?? null,
      subcode: error?.error_subcode ?? null,
      mensagem: error?.message ? redact(error.message) : null,
    },
    null,
    2,
  ),
);
console.log(
  outcome.ok
    ? '\n✔ A Meta aceitou. Confira o evento em Events Manager > Test Events antes de concluir qualquer coisa.\n'
    : '\n✖ A Meta não confirmou o recebimento. Leve o código/subcódigo acima para decidir o próximo passo.\n',
);
process.exit(outcome.ok ? 0 : 2);
