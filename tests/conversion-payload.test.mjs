import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRequestBody,
  buildServerEvent,
  PARTNER_AGENT,
  PayloadRejected,
  readMetaOutcome,
} from '../src/lib/conversions/capi-payload.ts';

const messaging = {
  lead_id: 'lead',
  dataset_id: '123456789',
  waba_id: 'waba',
  access_token: 'test',
  event_id: 'stable-event',
  event_name: 'QualifiedLead',
  event_time: 1000000000,
  action_source: 'business_messaging',
  user_data: { ctwa_clid: 'click', whatsapp_business_account_id: 'waba' },
};

const acquired = {
  ...messaging,
  event_name: 'VehicleAcquired',
  action_source: 'other',
  user_data: { ph: ['a'.repeat(64)] },
};

test('TESTE G/H: eventos de mensagens usam o contexto oficial de Business Messaging', () => {
  const event = buildServerEvent(messaging);
  assert.equal(event.action_source, 'business_messaging');
  assert.equal(event.messaging_channel, 'whatsapp');
  // partner_agent não fica no evento: ele é irmão de `data` no corpo.
  assert.equal(event.partner_agent, undefined);
  assert.equal(event.user_data.ctwa_clid, 'click');
  assert.equal(event.user_data.whatsapp_business_account_id, 'waba');
  // A data original do evento nunca é trocada por "agora" para ser aceita.
  assert.equal(event.event_time, messaging.event_time);

  const submitted = buildServerEvent({ ...messaging, event_name: 'LeadSubmitted' });
  assert.equal(submitted.event_name, 'LeadSubmitted');
});

test('TESTE I: a aquisição do veículo sai fora do canal de mensagens', () => {
  const event = buildServerEvent(acquired);
  assert.equal(event.action_source, 'other');
  assert.equal(event.messaging_channel, undefined);
  // Nunca inventar um ctwa_clid para um evento que não é da conversa.
  assert.equal(event.user_data.ctwa_clid, undefined);
  assert.deepEqual(event.user_data.ph, ['a'.repeat(64)]);
});

test('o valor pago, a dívida e as notas internas nunca chegam à Meta', () => {
  const body = buildRequestBody({
    ...acquired,
    valor: 25000,
    moeda: 'BRL',
    observacao: 'parcelas atrasadas, RENAJUD, placa ABC1D23',
  });
  const serialized = JSON.stringify(body);

  assert.equal(body.data[0].value, undefined);
  assert.equal(body.data[0].custom_data, undefined);
  assert.equal(serialized.includes('25000'), false);
  assert.equal(serialized.includes('RENAJUD'), false);
  assert.equal(serialized.includes('ABC1D23'), false);
  assert.equal(serialized.includes('BRL'), false);
});

test('a Meta não aceita evento personalizado no canal de mensagens', () => {
  // VehicleAcquired é custom: só existe fora de business_messaging.
  assert.throws(
    () => buildServerEvent({ ...messaging, event_name: 'VehicleAcquired' }),
    PayloadRejected,
  );
  // Purchase está na lista oficial do canal, mas exige valor: sem ele, nada sai.
  assert.throws(
    () => buildServerEvent({ ...messaging, event_name: 'Purchase' }),
    PayloadRejected,
  );
  // Nenhum nome arbitrário passa pela allowlist.
  for (const name of ['Lead', 'CustomThing', 'Subscribe']) {
    assert.throws(() => buildServerEvent({ ...messaging, event_name: name }), PayloadRejected);
  }
  assert.throws(
    () => buildServerEvent({ ...acquired, event_name: 'QualifiedLead' }),
    PayloadRejected,
  );
});

test('um evento sem vínculo com anúncio ou sem Dataset não é montado', () => {
  assert.throws(
    () => buildServerEvent({ ...messaging, user_data: { whatsapp_business_account_id: 'waba' } }),
    PayloadRejected,
  );
  assert.throws(() => buildServerEvent({ ...messaging, dataset_id: null }), PayloadRejected);
  assert.throws(() => buildServerEvent({ ...acquired, user_data: { ph: ['nao-e-hash'] } }), PayloadRejected);
  assert.throws(() => buildServerEvent({ ...messaging, event_time: 0 }), PayloadRejected);
});

test('só um recebimento confirmado é sucesso; respostas ambíguas exigem conciliação', () => {
  assert.equal(readMetaOutcome({ status: 200, body: { events_received: 1 } }).ok, true);
  // 200 sem confirmação não conta como enviado.
  assert.equal(readMetaOutcome({ status: 200, body: { events_received: 0 } }).ok, false);

  // Limite de requisições: a Meta não processou, então repetir é seguro.
  assert.equal(readMetaOutcome({ status: 429, body: { error: { code: 4 } } }).retryable, true);

  // Timeout e 5xx podem ter sido processados: nunca reenviar automaticamente.
  assert.equal(readMetaOutcome({ networkError: 'tempo esgotado' }).retryable, false);
  assert.equal(readMetaOutcome({ networkError: 'tempo esgotado' }).ok, false);
  assert.equal(readMetaOutcome({ status: 503, body: { error: { is_transient: true } } }).retryable, false);
  assert.equal(readMetaOutcome({ status: 400, body: { error: { message: 'bad' } } }).retryable, false);
});

const purchase = {
  ...messaging,
  event_name: 'Purchase',
  custom_data: { currency: 'BRL', value: 500 },
};

test('MODELO B: Purchase vai como Business Messaging com valor e moeda', () => {
  const event = buildServerEvent(purchase);
  assert.equal(event.event_name, 'Purchase');
  assert.equal(event.action_source, 'business_messaging');
  assert.equal(event.messaging_channel, 'whatsapp');
  // O mesmo clique original do anúncio.
  assert.equal(event.user_data.ctwa_clid, 'click');
  assert.equal(event.user_data.whatsapp_business_account_id, 'waba');
  assert.deepEqual(event.custom_data, { currency: 'BRL', value: 500 });
});

test('partner_agent fica no nível superior do corpo, como no exemplo oficial', () => {
  const body = buildRequestBody(purchase);
  assert.equal(body.partner_agent, PARTNER_AGENT);
  assert.equal(body.data[0].partner_agent, undefined);
});

test('VehicleAcquired nunca vira Business Messaging nem carrega valor', () => {
  // Custo de aquisição jamais entra no payload, mesmo se vier na fila.
  const event = buildServerEvent({ ...acquired, custom_data: { currency: 'BRL', value: 42000 } });
  assert.equal(event.action_source, 'other');
  assert.equal(event.custom_data, undefined);
  assert.equal(JSON.stringify(event).includes('42000'), false);

  // E o nome personalizado não é aceito no canal de mensagens.
  assert.throws(
    () => buildServerEvent({ ...purchase, event_name: 'VehicleAcquired' }),
    PayloadRejected,
  );
});

test('Purchase sem valor válido não é montado', () => {
  for (const custom of [null, {}, { currency: 'BRL' }, { currency: 'BRL', value: 0 }, { currency: 'BRL', value: -5 }, { value: 500 }, { currency: 'R$', value: 500 }]) {
    assert.throws(() => buildServerEvent({ ...purchase, custom_data: custom }), PayloadRejected);
  }
});

test('LeadSubmitted e QualifiedLead continuam sem custom_data nos dois modelos', () => {
  for (const name of ['LeadSubmitted', 'QualifiedLead']) {
    const event = buildServerEvent({ ...purchase, event_name: name });
    assert.equal(event.custom_data, undefined);
    assert.equal(event.action_source, 'business_messaging');
  }
});
