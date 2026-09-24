// Quem decide o que foi conectado é a Meta, não esta aplicação.
//
// O popup oficial do Embedded Signup já faz o login empresarial, lista as
// contas, mostra quais números são elegíveis, quais estão "não qualificados" e
// quais não podem ser compartilhados com o app. A dashboard não repete nada
// disso: ela aceita integralmente o resultado devolvido e, quando não veio um
// número utilizável, explica o que aconteceu e deixa tentar de novo depois.
//
// Por isso aqui não existe nenhuma escolha automática de número. Sem
// dependências: os testes importam este arquivo direto.

export type OnboardingRejectionReason =
  | 'no_waba'
  | 'ambiguous_waba'
  | 'waba_mismatch'
  | 'no_number'
  | 'number_not_shared';

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
    this.retryable = reason === 'no_number' || reason === 'number_not_shared';
  }
}

const ID = /^\d{5,30}$/;

/**
 * Qual WABA foi realmente autorizado.
 *
 * O id que veio do navegador só vale se a autorização concedida pela Meta
 * (lida no debug_token) realmente o incluir — caso contrário um payload
 * adulterado poderia apontar para o negócio de outro cliente. Quando a Meta
 * não informa o id e há mais de uma conta autorizada, a escolha é dela, não
 * nossa: preferimos parar e pedir para refazer.
 */
export function resolveAuthorizedWaba(input: {
  claimed?: string | null;
  authorized: string[];
}) {
  const claimed = input.claimed?.trim() || null;
  const authorized = input.authorized.filter((id) => ID.test(id));

  if (claimed && authorized.length > 0) {
    if (!authorized.includes(claimed)) {
      throw new OnboardingRejected('waba_mismatch');
    }
    return claimed;
  }

  // Sem granular_scopes só resta o que a Meta informou na sessão.
  if (claimed && ID.test(claimed)) {
    return claimed;
  }

  if (authorized.length === 1) {
    return authorized[0];
  }

  throw new OnboardingRejected(
    authorized.length > 1 ? 'ambiguous_waba' : 'no_waba',
  );
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
 * Só o número devolvido pelo Embedded Signup é aceito, e apenas se ele estiver
 * entre os que a Meta compartilhou com o app para aquele WABA — o que também
 * garante que ele pertence ao WABA autorizado, e não ao de outro cliente.
 *
 * Nenhum número é escolhido automaticamente. Se a Meta não liberou nenhum, o
 * caso é "inelegível": mensagem amigável e nova tentativa depois.
 */
export function resolveSharedNumber(input: {
  claimed?: string | null;
  numbers: ShareableNumber[];
}) {
  const claimed = input.claimed?.trim() || null;

  if (!claimed || !ID.test(claimed)) {
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
