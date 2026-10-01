// Validação e montagem das chamadas da ferramenta de App Review.
//
// FERRAMENTA TEMPORÁRIA. Existe só para gravar as evidências em vídeo exigidas
// pela Meta nas permissões whatsapp_business_messaging e
// whatsapp_business_management. Não tem relação com Conversões, Dataset, CAPI,
// Embedded Signup, WAHA ou Atendimento por IA.
//
// Sem dependências de propósito: os testes rodam direto no Node e nada aqui
// toca rede, banco ou `server-only`. O token nunca passa por este arquivo.

export const TEMPLATE_CATEGORIES = [
  "UTILITY",
  "MARKETING",
  "AUTHENTICATION",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export class ReviewInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewInputError";
  }
}

/**
 * Telefone no formato que a Cloud API espera: só dígitos, com código do país.
 *
 * A Meta aceita o número com ou sem "+"; normalizamos para dígitos puros para
 * não depender de como o operador digitou.
 */
export function normalizeRecipient(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");

  // Um número internacional válido tem entre 8 e 15 dígitos (E.164).
  if (digits.length < 8 || digits.length > 15) {
    throw new ReviewInputError(
      "Informe o número com código do país, apenas dígitos. Ex.: 5514999990000.",
    );
  }

  return digits;
}

/**
 * Nome de template conforme as regras da Meta: minúsculas, números e
 * underline, até 512 caracteres.
 */
export function normalizeTemplateName(raw: string): string {
  const name = (raw ?? "").trim();

  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    throw new ReviewInputError(
      "O nome do modelo aceita apenas letras minúsculas, números e underline.",
    );
  }

  return name;
}

// pt_BR, en_US, es... A Meta usa o código com underline.
export function normalizeLanguage(raw: string): string {
  const code = (raw ?? "").trim();

  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(code)) {
    throw new ReviewInputError(
      "Informe o idioma no formato da Meta, como pt_BR ou en_US.",
    );
  }

  return code;
}

export function normalizeCategory(raw: string): TemplateCategory {
  const category = (raw ?? "").trim().toUpperCase();

  if (!(TEMPLATE_CATEGORIES as readonly string[]).includes(category)) {
    throw new ReviewInputError("Categoria inválida.");
  }

  return category as TemplateCategory;
}

export function normalizeTemplateBody(raw: string): string {
  const text = (raw ?? "").trim();

  if (text.length < 5 || text.length > 1024) {
    throw new ReviewInputError(
      "O texto do modelo precisa ter entre 5 e 1024 caracteres.",
    );
  }

  return text;
}

// Só o identificador entra na URL. O token vai no cabeçalho Authorization,
// nunca em query string — quem faz isso deixa credencial em log de servidor.
function assertMetaId(value: string, label: string) {
  if (!/^\d{5,30}$/.test((value ?? "").trim())) {
    throw new ReviewInputError(`${label} inválido.`);
  }

  return value.trim();
}

export function graphBase(version: string) {
  return `https://graph.facebook.com/${version}`;
}

export function messagesEndpoint(version: string, phoneNumberId: string) {
  return `${graphBase(version)}/${assertMetaId(phoneNumberId, "Phone Number ID")}/messages`;
}

export function templatesEndpoint(version: string, wabaId: string) {
  return `${graphBase(version)}/${assertMetaId(wabaId, "WABA ID")}/message_templates`;
}

export type TemplateMessageInput = {
  to: string;
  templateName: string;
  language: string;
};

/**
 * Corpo do envio de template, conforme a Cloud API.
 *
 * Template em vez de texto livre de propósito: texto livre só sai dentro da
 * janela de 24 horas, e a gravação do vídeo não pode depender disso.
 */
export function buildTemplateMessageBody(input: TemplateMessageInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeRecipient(input.to),
    type: "template",
    template: {
      name: normalizeTemplateName(input.templateName),
      language: { code: normalizeLanguage(input.language) },
    },
  };
}

export type CreateTemplateInput = {
  name: string;
  language: string;
  category: string;
  body: string;
};

export function buildCreateTemplateBody(input: CreateTemplateInput) {
  return {
    name: normalizeTemplateName(input.name),
    language: normalizeLanguage(input.language),
    category: normalizeCategory(input.category),
    components: [
      { type: "BODY", text: normalizeTemplateBody(input.body) },
    ],
  };
}

// Sugestão de nome única, para não esbarrar em "template já existe" durante a
// gravação. Mantém o padrão de nome exigido pela Meta.
export function suggestTemplateName(now = new Date()) {
  const stamp = now
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(2, 12);

  return `trafego_academy_${stamp}`;
}

export type SanitizedMetaError = {
  code: number | null;
  subcode: number | null;
  message: string;
};

const SECRET_SHAPES = [
  /Bearer\s+[A-Za-z0-9._\-|]+/gi,
  /access_token=[^&\s"']+/gi,
  // Tokens de usuário/sistema da Meta começam com EAA e são longos.
  /\bEAA[A-Za-z0-9]{20,}/g,
];

/**
 * Deixa a resposta de erro apresentável sem carregar segredo junto.
 *
 * A Meta às vezes ecoa parte da requisição na mensagem de erro; por isso a
 * limpeza acontece no texto final, não só na origem.
 */
export function sanitizeMetaError(payload: unknown): SanitizedMetaError {
  const error = (payload as { error?: Record<string, unknown> } | null)?.error;

  let message =
    typeof error?.message === "string"
      ? error.message
      : "A Meta recusou a operação.";

  for (const shape of SECRET_SHAPES) {
    message = message.replace(shape, "[removido]");
  }

  return {
    code: typeof error?.code === "number" ? error.code : null,
    subcode:
      typeof error?.error_subcode === "number" ? error.error_subcode : null,
    message: message.slice(0, 400),
  };
}

// Só o que o vídeo precisa mostrar. Nada de eco da requisição.
export function readMessageResult(payload: unknown) {
  const body = payload as {
    messages?: { id?: string }[];
    contacts?: { wa_id?: string }[];
  } | null;

  return {
    messageId: body?.messages?.[0]?.id ?? null,
    waId: body?.contacts?.[0]?.wa_id ?? null,
  };
}

export function readTemplateResult(payload: unknown) {
  const body = payload as {
    id?: string;
    status?: string;
    category?: string;
  } | null;

  return {
    id: body?.id ?? null,
    status: body?.status ?? null,
    category: body?.category ?? null,
  };
}

export type ReviewTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
};

export function readTemplateList(payload: unknown): ReviewTemplate[] {
  const rows = (payload as { data?: Record<string, unknown>[] } | null)?.data;

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    language: String(row.language ?? ""),
    status: String(row.status ?? ""),
    category: String(row.category ?? ""),
  }));
}
