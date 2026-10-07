import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { authorizeDispatch } from '../src/lib/conversions/dispatch-auth.ts';

// Agendamento da fila de conversões pela Vercel Cron.
// Os segredos abaixo são fictícios e existem só neste teste.

const env = { CRON_SECRET: 'cron-test-secret-123', SYNC_SECRET_KEY: 'sync-test-secret-456' };
const headers = (init) => new Headers(init);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('cron rejeita chamadas sem segredo ou com segredo errado', () => {
  assert.equal(authorizeDispatch(headers({}), env), null);
  assert.equal(authorizeDispatch(headers({ authorization: 'Bearer ' }), env), null);
  assert.equal(authorizeDispatch(headers({ authorization: 'Bearer errado' }), env), null);
  assert.equal(authorizeDispatch(headers({ authorization: 'Bearer cron-test-secret-12' }), env), null);
  assert.equal(authorizeDispatch(headers({ authorization: 'Bearer cron-test-secret-1234' }), env), null);
  // O CRON_SECRET não vale no cabeçalho da chave de sincronização.
  assert.equal(authorizeDispatch(headers({ 'x-sync-key': 'cron-test-secret-123' }), env), null);
});

test('segredo não configurado nunca autoriza, nem com cabeçalho vazio', () => {
  assert.equal(authorizeDispatch(headers({ authorization: 'Bearer ' }), {}), null);
  assert.equal(authorizeDispatch(headers({ authorization: 'Bearer x' }), { CRON_SECRET: '', SYNC_SECRET_KEY: '  ' }), null);
  assert.equal(authorizeDispatch(headers({ 'x-sync-key': '' }), { SYNC_SECRET_KEY: '' }), null);
});

test('cron aceita o CRON_SECRET correto no Bearer', () => {
  assert.equal(authorizeDispatch(headers({ authorization: 'Bearer cron-test-secret-123' }), env), 'cron');
  assert.equal(authorizeDispatch(headers({ authorization: 'bearer cron-test-secret-123' }), env), 'cron');
  // Só o CRON_SECRET configurado, sem a chave antiga.
  assert.equal(
    authorizeDispatch(headers({ authorization: 'Bearer cron-test-secret-123' }), { CRON_SECRET: env.CRON_SECRET }),
    'cron',
  );
});

test('SYNC_SECRET_KEY continua valendo como antes (x-sync-key, Bearer ou Authorization cru)', () => {
  assert.equal(authorizeDispatch(headers({ 'x-sync-key': 'sync-test-secret-456' }), env), 'sync_key');
  assert.equal(authorizeDispatch(headers({ authorization: 'Bearer sync-test-secret-456' }), env), 'sync_key');
  assert.equal(authorizeDispatch(headers({ authorization: 'sync-test-secret-456' }), env), 'sync_key');
  // Sem CRON_SECRET configurado, o comportamento antigo segue idêntico.
  assert.equal(
    authorizeDispatch(headers({ 'x-sync-key': 'sync-test-secret-456' }), { SYNC_SECRET_KEY: env.SYNC_SECRET_KEY }),
    'sync_key',
  );
});

test('a rota usa a autorização compartilhada e responde 401 sem ela', () => {
  const route = read('src/app/api/conversions/dispatch/route.ts');
  assert.match(route, /authorizeDispatch\(request\.headers\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  // Nenhum segredo chega à resposta nem ao log.
  assert.equal(/console\.|CRON_SECRET\s*[},]/.test(route.replace(/\/\/.*$/gm, '')), false);
});

test('vercel.json agenda a fila a cada 5 minutos', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.deepEqual(config.crons, [{ path: '/api/conversions/dispatch', schedule: '*/5 * * * *' }]);
});

test('o dispatcher continua desligado por padrão e o cron não toca na fila assim', () => {
  const dispatcher = read('src/lib/conversions/dispatcher.ts');
  assert.match(dispatcher, /CONVERSIONS_DISPATCHER_ENABLED\?\.trim\(\) === "true"/);
  // A checagem do interruptor vem antes de qualquer reserva na fila.
  const body = dispatcher.slice(dispatcher.indexOf('export async function dispatchConversionEvents'));
  assert.ok(body.indexOf('isDispatcherEnabled()') > 0);
  assert.ok(body.indexOf('isDispatcherEnabled()') < body.indexOf('capi_fetch_queue'));

  assert.match(read('.env.example'), /^CONVERSIONS_DISPATCHER_ENABLED=false$/m);
  assert.match(read('.env.example'), /^CRON_SECRET=$/m);
  // Nem o vercel.json nem a rota ligam o envio.
  assert.equal(read('vercel.json').includes('CONVERSIONS_DISPATCHER_ENABLED'), false);
  assert.equal(read('src/app/api/conversions/dispatch/route.ts').includes('process.env'), false);
});
