// Quem decide o que foi conectado é a Meta, não esta aplicação.
//
// O popup oficial do Embedded Signup já faz o login empresarial, lista as
// contas, mostra quais números são elegíveis, quais estão "não qualificados" e
// quais não podem ser compartilhados com o app. A dashboard não repete nada
// disso: ela aceita integralmente o resultado devolvido e, quando não veio um
// número utilizável, explica o que aconteceu e deixa tentar de novo depois.
//
// Por isso aqui não existe escolha entre números. A única dedução permitida é
// a documentada para o onboarding do aplicativo WhatsApp Business (abaixo).
// Sem dependências: os testes importam este arquivo direto.

export type OnboardingRejectionReason =
  | 'no_waba'
  | 'ambiguous_waba'
  | 'waba_mismatch'
  | 'no_number'
  | 'number_not_shared'
  | 'business_app_number_unresolved'
  | 'business_app_number_not_on_app'
  | 'missing_management_scope';

// Mensagens para o cliente: sem jargão, sem culpa e sempre com uma saída.
const MESSAGES: Record<OnboardingRejectionReason, string> = {
  no_waba:
    'A autorização foi concluída sem uma conta do WhatsApp Business. Tente conectar novamente e selecione a sua conta na janela da Meta.',
  ambiguous_waba:
    'A Meta não indicou qual conta do WhatsApp Business foi escolhida. Tente conectar novamente e selecione uma única conta.',
  waba_mismatch:
    'A conta selecionada não confere com a autorização recebida. Por segurança, nada foi conectado. Tente novamente.',
  no_number:
    'Sua conta foi autorizada, mas nenhum número foi liberado para conexão. Isso costuma acontecer quando o número ainda não está qualificado pela Meta. Você pode tentar novamente mais tarde — seu WhatsApp continua funcionando normalmente.',
  number_not_shared:
    'O número escolhido ainda não está disponível para conexão. Se você acabou de concluir o cadastro na Meta, aguarde alguns minutos e tente novamente. Seu WhatsApp continua funcionando normalmente.',
  business_app_number_unresolved:
    'A Meta concluiu a conexão, mas a conta tem mais de um número e não indicou qual foi conectado. Por segurança, nada foi conectado. Fale com o seu gestor — seu WhatsApp continua funcionando normalmente.',
  business_app_number_not_on_app:
    'A Meta não confirmou que este número continua no aplicativo WhatsApp Business. Por segurança, nada foi conectado. Fale com o seu gestor — seu WhatsApp continua funcionando normalmente.',
  missing_management_scope:
    'A Meta não concedeu a permissão para gerenciar a sua conta do WhatsApp Business. Conecte novamente e aceite todas as permissões pedidas.',
};

export class OnboardingRejected extends Error {
  readonly reason: OnboardingRejectionReason;
  readonly userMessage: string;
  // Número inelegível não é falha nossa nem erro de configuração: o cliente
  // pode simplesmente tentar mais tarde.
  readonly retryable: boolean;

  constructor(reason: OnboardingRejectionReason) {
    super(`Embedded Signup rejeitado: ${reason}`);
    this.name = 'OnboardingRejected';
    this.reason = reason;
    this.userMessage = MESSAGES[reason];
    this.retryable =
      reason === 'no_number' ||
      reason === 'number_not_shared' ||
      reason === 'missing_management_scope';
  }
}

const ID = /^\d{5,30}$/;

// ---------------------------------------------------------------------------
// Evento de sessão do popup (postMessage "WA_EMBEDDED_SIGNUP").
// ---------------------------------------------------------------------------

// Eventos documentados em Embedded Signup > Implementation.
export const SIGNUP_EVENTS = [
  'FINISH',
  'FINISH_ONLY_WABA',
  'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
  'FINISH_OBO_MIGRATION',
  'FINISH_GRANT_ONLY_API_ACCESS',
  'CANCEL',
  'ERROR',
] as const;

export type SignupEvent = (typeof SIGNUP_EVENTS)[number];

// Onboarding do aplicativo WhatsApp Business (Coexistence). Segundo a
// documentação oficial, o evento traz só o waba_id — sem phone_number_id.
export const BUSINESS_APP_EVENT: SignupEvent = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';

export type SignupSession = {
  event: SignupEvent | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  currentStep: string | null;
  errorMessage: string | null;
};

/** O postMessage veio mesmo da Meta? Só https e só *.facebook.com. */
export function isFacebookOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))
    );
  } catch {
    return false;
  }
}

/**
 * Lê o evento de sessão do Embedded Signup. Devolve null para qualquer
 * mensagem que não seja da Meta ou não seja deste fluxo. Nada é inferido:
 * só o que veio no payload.
 */
export function parseSignupMessage(origin: string, raw: unknown): SignupSession | null {
  if (!isFacebookOrigin(origin)) {
    return null;
  }

  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const message = parsed as {
    type?: unknown;
    event?: unknown;
    data?: Record<string, unknown> | null;
  };

  if (message.type !== 'WA_EMBEDDED_SIGNUP') {
    return null;
  }

  const event = SIGNUP_EVENTS.includes(message.event as SignupEvent)
    ? (message.event as SignupEvent)
    : null;
  const data = message.data && typeof message.data === 'object' ? message.data : {};
  const id = (value: unknown) =>
    typeof value === 'string' && ID.test(value.trim()) ? value.trim() : null;
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : null;

  return {
    event,
    wabaId: id(data.waba_id),
    phoneNumberId: id(data.phone_number_id),
    currentStep: text(data.current_step),
    errorMessage: text(data.error_message),
  };
}

// ---------------------------------------------------------------------------
// Autorização: o que o token realmente concede.
// ---------------------------------------------------------------------------

/** O token precisa da permissão de gestão do WhatsApp Business. */
export function assertManagementScope(scopes: string[]) {
  if (!scopes.includes('whatsapp_business_management')) {
    throw new OnboardingRejected('missing_management_scope');
  }
}

/**
 * Qual WABA foi realmente autorizado.
 *
 * Os ids aceitos são só os que o próprio token concede (granular_scopes do
 * debug_token). O id que veio do navegador nunca é aceito sozinho: sem a
 * confirmação do token, um payload adulterado poderia apontar para o negócio
 * de outro cliente. Quando a Meta não informa o id e há mais de uma conta
 * autorizada, a escolha é dela, não nossa: preferimos parar e pedir para
 * refazer.
 */
export function resolveAuthorizedWaba(input: {
  claimed?: string | null;
  authorized: string[];
}) {
  const claimed = input.claimed?.trim() || null;
  const authorized = input.authorized.filter((id) => ID.test(id));

  if (authorized.length === 0) {
    // Token sem WABA granular: nada a conferir, nada conectado.
    throw new OnboardingRejected('no_waba');
  }

  if (claimed) {
    if (!authorized.includes(claimed)) {
      throw new OnboardingRejected('waba_mismatch');
    }
    return claimed;
  }

  if (authorized.length === 1) {
    return authorized[0];
  }

  throw new OnboardingRejected('ambiguous_waba');
}

export type ShareableNumber = {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  isOnBizApp: boolean | null;
  platformType: string | null;
};

/**
 * Qual número a Meta liberou.
 *
 * Fluxo padrão (FINISH): só o número devolvido pelo Embedded Signup é aceito,
 * e apenas se ele estiver entre os que a Meta compartilhou com o app para
 * aquele WABA — o que também garante que ele pertence ao WABA autorizado, e
 * não ao de outro cliente.
 *
 * Onboarding do aplicativo WhatsApp Business (FINISH_WHATSAPP_BUSINESS_APP_
 * ONBOARDING): a documentação oficial diz que o evento traz só o waba_id. O
 * número é então o ÚNICO que a Meta colocou no WABA autorizado, e só se ela
 * confirmar is_on_biz_app=true. Com zero ou vários números não há o que
 * deduzir: nada é conectado. Não é uma escolha entre opções.
 *
 * Em nenhum caso há fallback para outro número.
 */
export function resolveSharedNumber(input: {
  claimed?: string | null;
  numbers: ShareableNumber[];
  event?: SignupEvent | null;
}) {
  const claimed = input.claimed?.trim() || null;

  if (claimed) {
    if (!ID.test(claimed)) {
      throw new OnboardingRejected('no_number');
    }

    const shared = input.numbers.find((number) => number.id === claimed);

    if (!shared) {
      throw new OnboardingRejected(
        input.numbers.length === 0 ? 'no_number' : 'number_not_shared',
      );
    }

    return shared;
  }

  if (input.event === BUSINESS_APP_EVENT) {
    if (input.numbers.length === 0) {
      throw new OnboardingRejected('no_number');
    }

    if (input.numbers.length > 1) {
      throw new OnboardingRejected('business_app_number_unresolved');
    }

    const [only] = input.numbers;

    if (only.isOnBizApp !== true) {
      throw new OnboardingRejected('business_app_number_not_on_app');
    }

    return only;
  }

  throw new OnboardingRejected('no_number');
}
