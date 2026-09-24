// Preparo do SDK do Facebook usado pelo Embedded Signup.
//
// O SDK é carregado uma vez por aba, mas o componente que o usa monta e
// desmonta a cada navegação interna. Quando o cliente volta para Conversões
// sem recarregar a página, o script já está lá e o evento de carregamento não
// acontece de novo — então quem depende só dele fica esperando para sempre.
//
// Aqui o estado vem de `window.FB`, que é a verdade, e não de ter visto o
// script carregar. Sem dependências: os testes rodam direto no Node com um
// `window` de mentira.

export type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ) => void;
};

export type FacebookSdkHost = { FB?: FacebookSdk };

export type FacebookSdkConfig = {
  appId: string;
  version: string;
};

// `FB.init` é global e reentrante: chamar de novo com a mesma configuração é
// desperdício, e com outra seria trocar o app no meio do caminho. A marca fica
// no próprio host para sobreviver a remontagens sem virar estado de módulo,
// que o React Fast Refresh zeraria.
const INITIALIZED = Symbol.for("trafegoacademy.fbSdkInitialized");

type MarkedHost = FacebookSdkHost & { [INITIALIZED]?: string };

export function isFacebookSdkPresent(
  host: FacebookSdkHost | undefined,
): host is FacebookSdkHost & { FB: FacebookSdk } {
  return typeof host?.FB?.init === "function";
}

/**
 * Deixa o SDK pronto para uso e diz se dá para abrir o Embedded Signup.
 *
 * Serve para os dois caminhos sem ramificação na tela: o carregamento normal
 * do script e a navegação interna em que `window.FB` já existe.
 */
export function ensureFacebookSdk(
  host: FacebookSdkHost | undefined,
  config: FacebookSdkConfig,
): boolean {
  if (!isFacebookSdkPresent(host)) {
    return false;
  }

  if (!config.appId || !config.version) {
    return false;
  }

  const marked = host as MarkedHost;
  const signature = `${config.appId}|${config.version}`;

  if (marked[INITIALIZED] === signature) {
    return true;
  }

  try {
    host.FB.init({
      appId: config.appId,
      autoLogAppEvents: true,
      xfbml: false,
      version: config.version,
    });
  } catch {
    // SDK presente mas recusando inicializar: melhor manter o botão travado
    // com o aviso do que abrir uma janela que não vai concluir nada.
    return false;
  }

  marked[INITIALIZED] = signature;
  return true;
}
