// Diagnóstico seguro do onboarding oficial do WhatsApp (Embedded Signup).
//
// Cada chamada à Meta acontece numa ETAPA nomeada. Quando algo falha, o que
// sai daqui é sempre o mesmo formato, pensado para log e para o painel do
// administrador:
//
//   [meta/onboarding] exchange_code_failed
//   { stage: "exchange_code", httpStatus: 400, metaCode: 100, subcode: 36007 }
//
// Nunca entra em log: access_token, code OAuth, app secret, cabeçalho
// Authorization nem a chave de criptografia. A mensagem crua da Meta também
// não é logada — só o código, o subcódigo e a classificação.
//
// Sem dependências: os testes importam este arquivo direto.

export type OnboardingStage =
  | 'exchange_code'
  | 'debug_token'
  | 'waba_details'
  | 'list_numbers'
  | 'check_subscription'
  | 'subscribe_webhook'
  | 'resolve_dataset'
  | 'smb_sync_contacts'
  | 'smb_sync_history'
  | 'save_connection';

export type MetaFailureKind =
  // A Meta recusou a troca por causa do redirect_uri. Pelo fluxo documentado do
  // Embedded Signup (FB.login + code) a troca NÃO leva redirect_uri; quando a
  // Meta reclama dele, a causa é a configuração do Facebook Login for Business
  // no painel do app, não um parâmetro faltando no código.
  | 'redirect_uri_mismatch'
  // Código expirado (vida de 30 s), já usado ou inválido.
  | 'code_invalid'
  | 'token_invalid'
  | 'missing_permission'
  | 'rate_limited'
  | 'transient'
  | 'network'
  | 'unknown';

export type MetaFailure = {
  stage: OnboardingStage;
  kind: MetaFailureKind;
  httpStatus: number | null;
  metaCode: number | null;
  subcode: number | null;
  retryable: boolean;
};

// Erro carregado entre as camadas. Sem a mensagem crua da Meta de propósito:
// ela pode ecoar parâmetros da requisição.
export class MetaGraphFailure extends Error {
  readonly failure: MetaFailure;

  constructor(failure: MetaFailure) {
    super(`[meta/onboarding] ${failure.stage}_failed (${failure.kind})`);
    this.name = 'MetaGraphFailure';
    this.failure = failure;
  }
}

export function isMetaGraphFailure(error: unknown): error is MetaGraphFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'failure' in error &&
    typeof (error as { failure?: { stage?: unknown } }).failure?.stage === 'string'
  );
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80007, 130429, 131056]);
const TRANSIENT_CODES = new Set([1, 2, 131000]);
// 10 e a faixa 200–299 são "permissão negada" na Graph API.
const isPermissionCode = (code: number | null) =>
  code === 10 || (code !== null && code >= 200 && code <= 299);

/**
 * Classifica a resposta de erro da Graph API. `message` só é usada para
 * reconhecer o caso do redirect_uri e o de código expirado/usado; ela nunca
 * é devolvida nem logada.
 */
export function classifyMetaError(input: {
  stage: OnboardingStage;
  httpStatus: number | null;
  metaCode?: number | null;
  subcode?: number | null;
  message?: string | null;
}): MetaFailure {
  const metaCode = typeof input.metaCode === 'number' ? input.metaCode : null;
  const subcode = typeof input.subcode === 'number' ? input.subcode : null;
  const message = (input.message ?? '').toLowerCase();
  const base = { stage: input.stage, httpStatus: input.httpStatus, metaCode, subcode };

  if (input.stage === 'exchange_code' && message.includes('redirect_uri')) {
    return { ...base, kind: 'redirect_uri_mismatch', retryable: false };
  }

  if (
    input.stage === 'exchange_code' &&
    (metaCode === 100 || subcode === 36007 || subcode === 36009 ||
      /code.*(expired|been used|invalid)|verification code/.test(message))
  ) {
    return { ...base, kind: 'code_invalid', retryable: true };
  }

  if (metaCode === 190 || metaCode === 102) {
    return { ...base, kind: 'token_invalid', retryable: false };
  }

  if (isPermissionCode(metaCode)) {
    return { ...base, kind: 'missing_permission', retryable: false };
  }

  if (metaCode !== null && RATE_LIMIT_CODES.has(metaCode)) {
    return { ...base, kind: 'rate_limited', retryable: true };
  }

  if (
    (metaCode !== null && TRANSIENT_CODES.has(metaCode)) ||
    (input.httpStatus !== null && input.httpStatus >= 500)
  ) {
    return { ...base, kind: 'transient', retryable: true };
  }

  return { ...base, kind: 'unknown', retryable: false };
}

export function networkFailure(stage: OnboardingStage): MetaFailure {
  return {
    stage,
    kind: 'network',
    httpStatus: null,
    metaCode: null,
    subcode: null,
    retryable: true,
  };
}

// Texto para o cliente: simples, sem jargão e sempre com uma saída.
export function failureUserMessage(failure: MetaFailure): string {
  switch (failure.kind) {
    case 'redirect_uri_mismatch':
      return 'A conexão com a Meta não está configurada corretamente do nosso lado. Avisamos a equipe; tente novamente mais tarde.';
    case 'code_invalid':
      return 'A autorização da Meta expirou antes de terminarmos. Conecte novamente.';
    case 'token_invalid':
      return 'A autorização da Meta expirou. Conecte o WhatsApp Business novamente.';
    case 'missing_permission':
      return 'A Meta não concedeu todas as permissões necessárias. Conecte novamente e aceite todas as permissões pedidas.';
    case 'rate_limited':
    case 'transient':
      return 'A Meta está instável no momento. Tente novamente em alguns minutos.';
    case 'network':
      return 'A Meta não respondeu a tempo. A conexão não foi concluída; tente novamente.';
    default:
      return 'Não foi possível concluir a conexão com a Meta. Tente novamente em alguns minutos.';
  }
}

// Texto para o administrador: aponta onde agir, sem segredos.
export function failureAdminHint(failure: MetaFailure): string {
  const where = `etapa ${failure.stage}, HTTP ${failure.httpStatus ?? '—'}, código ${failure.metaCode ?? '—'}${failure.subcode !== null ? `/${failure.subcode}` : ''}`;

  switch (failure.kind) {
    case 'redirect_uri_mismatch':
      return `Meta recusou a troca do código por redirect_uri (${where}). O fluxo documentado não envia redirect_uri: revise Facebook Login for Business > Settings (Login with the JavaScript SDK, Allowed domains, Valid OAuth redirect URIs) e se a Configuration ID é de WhatsApp Embedded Signup.`;
    case 'code_invalid':
      return `Código do Embedded Signup expirado, já usado ou inválido (${where}). Ele vale 30 s.`;
    case 'token_invalid':
      return `Token recusado pela Meta (${where}).`;
    case 'missing_permission':
      // O endpoint de Dataset exige whatsapp_business_manage_events, que ainda
      // não foi aprovada. Isso NÃO é falha do Embedded Signup: WABA e número
      // seguem conectados e a conexão fica em dataset_pending.
      if (failure.stage === 'resolve_dataset') {
        return `Dataset pendente: a Meta recusou por permissão (${where}). O endpoint de Dataset exige whatsapp_business_manage_events, que depende de um App Review separado para Conversões. WhatsApp e número continuam conectados.`;
      }
      return `Permissão ausente (${where}). Confira as permissões da Configuration ID e o acesso avançado do app.`;
    case 'rate_limited':
      return `Limite de chamadas da Meta (${where}).`;
    case 'transient':
      return `Instabilidade da Meta (${where}).`;
    case 'network':
      return `Sem resposta da Meta (${where}).`;
    default:
      return `Falha da Meta (${where}).`;
  }
}

/**
 * Objeto seguro para console. Só números, etapa e classificação — nada que
 * possa conter token, code ou secret.
 */
export function failureLogPayload(failure: MetaFailure) {
  return {
    stage: failure.stage,
    kind: failure.kind,
    httpStatus: failure.httpStatus,
    metaCode: failure.metaCode,
    subcode: failure.subcode,
    retryable: failure.retryable,
  };
}

export function failureLogLabel(failure: MetaFailure) {
  return `[meta/onboarding] ${failure.stage}_failed`;
}

// Rede de segurança para qualquer texto que ainda vá para log ou banco:
// remove o que tem cara de token, code ou secret.
export function redactSecrets(text: string) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-|]+/gi, 'Bearer [removido]')
    .replace(/(access_token|client_secret|code|input_token)=([^&\s"']+)/gi, '$1=[removido]')
    .replace(/\bEA[A-Za-z0-9]{20,}\b/g, '[token removido]')
    .replace(/\b\d{10,20}\|[A-Za-z0-9_-]{16,}\b/g, '[app token removido]');
}
