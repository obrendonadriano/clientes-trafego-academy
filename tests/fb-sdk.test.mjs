import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ensureFacebookSdk,
  isFacebookSdkPresent,
} from '../src/lib/meta/fb-sdk.ts';

// Regressão: ao navegar internamente para Conversões, o botão "Conectar
// WhatsApp Business" ficava travado em "Preparando a conexão segura..." até
// recarregar a página. O script já estava carregado e o evento de load não se
// repetia, então quem dependia só dele nunca ficava pronto.

const CONFIG = { appId: '123456789', version: 'v26.0' };

function fakeWindow() {
  const calls = [];
  return {
    calls,
    host: {
      FB: {
        init: (options) => calls.push(options),
        login: () => {},
      },
    },
  };
}

test('navegação interna: com window.FB já presente, o SDK fica pronto na montagem', () => {
  const { host, calls } = fakeWindow();

  // Nenhum evento de carregamento aconteceu nesta montagem — o script já
  // estava na página desde a navegação anterior.
  assert.equal(ensureFacebookSdk(host, CONFIG), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    appId: CONFIG.appId,
    autoLogAppEvents: true,
    xfbml: false,
    version: CONFIG.version,
  });
});

test('FB.init é idempotente entre remontagens da mesma tela', () => {
  const { host, calls } = fakeWindow();

  // Entrar, sair e voltar em Conversões remonta o componente várias vezes.
  for (let i = 0; i < 5; i += 1) {
    assert.equal(ensureFacebookSdk(host, CONFIG), true);
  }

  assert.equal(calls.length, 1, 'FB.init deveria rodar uma única vez');
});

test('trocar de app ou de versão reinicializa o SDK', () => {
  const { host, calls } = fakeWindow();

  ensureFacebookSdk(host, CONFIG);
  ensureFacebookSdk(host, { ...CONFIG, version: 'v27.0' });
  ensureFacebookSdk(host, { ...CONFIG, appId: '999999999' });

  assert.equal(calls.length, 3);
});

test('sem o SDK carregado o botão continua travado, sem erro', () => {
  assert.equal(ensureFacebookSdk({}, CONFIG), false);
  assert.equal(ensureFacebookSdk(undefined, CONFIG), false);
  // Um `FB` pela metade não conta como carregado.
  assert.equal(ensureFacebookSdk({ FB: {} }, CONFIG), false);
  assert.equal(isFacebookSdkPresent({ FB: {} }), false);
});

test('configuração incompleta não libera o botão', () => {
  const { host, calls } = fakeWindow();

  assert.equal(ensureFacebookSdk(host, { appId: '', version: 'v26.0' }), false);
  assert.equal(ensureFacebookSdk(host, { appId: '123', version: '' }), false);
  assert.equal(calls.length, 0);
});

test('SDK que recusa inicializar não libera o botão', () => {
  const host = {
    FB: {
      init: () => {
        throw new Error('bloqueado');
      },
      login: () => {},
    },
  };

  assert.equal(ensureFacebookSdk(host, CONFIG), false);
});

test('a tela usa onReady e confere window.FB na montagem', () => {
  const source = readFileSync(
    new URL('../src/components/conversions/whatsapp-official-connection.tsx', import.meta.url),
    'utf8',
  );

  // onLoad sozinho é justamente o bug: não dispara na remontagem.
  assert.equal(/onLoad=/.test(source), false, 'onLoad não cobre navegação interna');
  assert.equal(source.includes('onReady={prepareSdk}'), true);

  // E a montagem não espera pelo script: confere o SDK que já estiver lá.
  assert.match(source, /useEffect\(\(\) => \{\s*prepareSdk\(\);\s*\}, \[prepareSdk\]\);/);
  assert.equal(source.includes('ensureFacebookSdk'), true);

  // Falha de carregamento avisa em vez de deixar "Preparando…" para sempre.
  assert.equal(source.includes('onError='), true);
});

test('o bug não volta: nenhuma regra do Embedded Signup mudou', () => {
  const source = readFileSync(
    new URL('../src/components/conversions/whatsapp-official-connection.tsx', import.meta.url),
    'utf8',
  );

  assert.equal(source.includes('whatsapp_business_app_onboarding'), true);
  assert.equal(source.includes('sessionInfoVersion: 3'), true);
  assert.equal(source.includes("response_type: 'code'") || source.includes('response_type: "code"'), true);
  assert.equal(source.includes('override_default_response_type: true'), true);
  // A tela continua sem escolher número por conta própria.
  assert.equal(/listPhoneNumbers|phone_numbers/.test(source), false);
});
