import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OnboardingRejected,
  resolveAuthorizedWaba,
  resolveSharedNumber,
} from '../src/lib/meta/onboarding-selection.ts';

// Quem decide o que foi conectado é o popup oficial da Meta. Estes testes
// existem para impedir que a dashboard volte a escolher número por conta
// própria ou a contornar a elegibilidade decidida lá.

const number = (id, extra = {}) => ({
  id,
  displayPhoneNumber: '+55 14 99999-0001',
  verifiedName: 'Loja',
  isOnBizApp: true,
  platformType: 'CLOUD_API',
  ...extra,
});

test('o WABA aceito é o que a autorização da Meta realmente concede', () => {
  assert.equal(
    resolveAuthorizedWaba({ claimed: '111111', authorized: ['111111', '222222'] }),
    '111111',
  );

  // Uma conta autorizada e nenhum id informado: não há o que escolher.
  assert.equal(resolveAuthorizedWaba({ claimed: null, authorized: ['333333'] }), '333333');

  // Sem granular_scopes só resta o que a sessão informou.
  assert.equal(resolveAuthorizedWaba({ claimed: '444444', authorized: [] }), '444444');
});

test('um WABA fora da autorização nunca conecta — nem por engano, nem por payload adulterado', () => {
  try {
    resolveAuthorizedWaba({ claimed: '999999', authorized: ['111111'] });
    assert.fail('deveria recusar');
  } catch (error) {
    assert.ok(error instanceof OnboardingRejected);
    assert.equal(error.reason, 'waba_mismatch');
    // Não é "tente de novo mais tarde": é um sinal de que algo está errado.
    assert.equal(error.retryable, false);
  }
});

test('com várias contas autorizadas e nenhuma indicada, a dashboard não escolhe', () => {
  try {
    resolveAuthorizedWaba({ claimed: null, authorized: ['111111', '222222'] });
    assert.fail('deveria recusar');
  } catch (error) {
    assert.equal(error.reason, 'ambiguous_waba');
  }

  try {
    resolveAuthorizedWaba({ claimed: null, authorized: [] });
    assert.fail('deveria recusar');
  } catch (error) {
    assert.equal(error.reason, 'no_waba');
  }
});

test('só o número devolvido pela Meta é conectado', () => {
  const chosen = resolveSharedNumber({
    claimed: '5550002',
    numbers: [number('5550001'), number('5550002'), number('5550003')],
  });

  assert.equal(chosen.id, '5550002');
});

test('a dashboard nunca escolhe um número por conta própria', () => {
  // Um único número compartilhado não autoriza conectá-lo sem a Meta ter dito.
  try {
    resolveSharedNumber({ claimed: null, numbers: [number('5550001')] });
    assert.fail('deveria recusar');
  } catch (error) {
    assert.equal(error.reason, 'no_number');
  }

  // Nem mesmo "o que está no app do celular" serve como desempate.
  try {
    resolveSharedNumber({
      claimed: null,
      numbers: [number('5550001', { isOnBizApp: false }), number('5550002')],
    });
    assert.fail('deveria recusar');
  } catch (error) {
    assert.equal(error.reason, 'no_number');
  }
});

test('número que a Meta não compartilhou não é conectado', () => {
  try {
    resolveSharedNumber({ claimed: '5559999', numbers: [number('5550001')] });
    assert.fail('deveria recusar');
  } catch (error) {
    assert.equal(error.reason, 'number_not_shared');
  }
});

test('número inelegível vira mensagem amigável com nova tentativa', () => {
  for (const reason of ['no_number', 'number_not_shared']) {
    const error = new OnboardingRejected(reason);
    assert.equal(error.retryable, true);
    // Sem jargão e sem assustar: o WhatsApp do cliente não foi afetado.
    assert.match(error.userMessage, /tentar novamente|tente novamente/i);
    assert.match(error.userMessage, /continua funcionando normalmente/i);
    assert.equal(/WABA|Dataset|CAPI|token|phone_number_id/i.test(error.userMessage), false);
  }
});

test('FINISH_ONLY_WABA (conta autorizada, nenhum número liberado) é o caso inelegível', () => {
  try {
    resolveSharedNumber({ claimed: null, numbers: [] });
    assert.fail('deveria recusar');
  } catch (error) {
    assert.equal(error.reason, 'no_number');
    assert.equal(error.retryable, true);
  }
});
