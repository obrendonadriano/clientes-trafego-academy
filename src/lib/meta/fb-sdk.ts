// SDK JavaScript do Facebook para o Embedded Signup, de forma idempotente.
//
// O bug que isto resolve: o `onLoad` do next/script só dispara na PRIMEIRA vez
// que o script carrega. Numa navegação dentro do app, o window.FB já existe,
// o `onLoad` não volta a disparar e a tela ficava presa em "Preparando a
// conexão segura…". Agora qualquer caminho (montagem, onReady, onLoad) chama
// ensureFacebookSdk, que reconhece o SDK já carregado e só roda FB.init uma
// vez por app/versão.
//
// Sem dependências e sem nada de React: os testes importam este arquivo direto.

export type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void,
    options: Record<string, unknown>,
  ) => void;
};

export type SdkHost = {
  FB?: FacebookSdk;
  // Marca qual app/versão já foi inicializado nesta aba.
  __taFacebookSdkInit?: string;
};

/**
 * Confirma que o SDK está pronto para o FB.login. Devolve false enquanto o
 * script ainda não carregou; nunca inicializa duas vezes o mesmo app/versão.
 */
export function ensureFacebookSdk(
  host: SdkHost | undefined,
  options: { appId?: string; version?: string },
): boolean {
  if (!host?.FB || !options.appId || !options.version) {
    return false;
  }

  const key = `${options.appId}@${options.version}`;

  if (host.__taFacebookSdkInit !== key) {
    host.FB.init({
      appId: options.appId,
      autoLogAppEvents: true,
      xfbml: false,
      version: options.version,
    });
    host.__taFacebookSdkInit = key;
  }

  return true;
}

/**
 * O código do FB.login e o evento de sessão (postMessage) chegam por canais
 * separados e sem ordem garantida. Espera um pouco pelo evento antes de
 * enviar o código ao servidor — bem dentro dos 30 s de vida do código.
 */
export async function waitForSessionEvent(
  hasEvent: () => boolean,
  options: { timeoutMs?: number; stepMs?: number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const timeoutMs = options.timeoutMs ?? 2000;
  const stepMs = options.stepMs ?? 100;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let waited = 0; waited < timeoutMs && !hasEvent(); waited += stepMs) {
    await sleep(stepMs);
  }

  return hasEvent();
}

export type LoginOutcome =
  | { kind: 'code'; code: string }
  | { kind: 'cancelled'; atStep: string | null }
  | { kind: 'error'; message: string | null }
  | { kind: 'closed' };

/**
 * O que aconteceu na janela da Meta, a partir do callback do FB.login e do
 * evento de sessão. Sem código não há nada a enviar ao servidor.
 */
export function describeLoginOutcome(
  code: string | null | undefined,
  session: { event: string | null; currentStep: string | null; errorMessage: string | null } | null,
): LoginOutcome {
  if (code) {
    return { kind: 'code', code };
  }

  if (session?.event === 'ERROR') {
    return { kind: 'error', message: session.errorMessage };
  }

  if (session?.event === 'CANCEL') {
    return { kind: 'cancelled', atStep: session.currentStep };
  }

  return { kind: 'closed' };
}
