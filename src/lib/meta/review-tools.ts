import "server-only";

import { getMetaGraphVersion } from "@/lib/meta/conversions-config";
import {
  buildCreateTemplateBody,
  buildTemplateMessageBody,
  messagesEndpoint,
  readMessageResult,
  readTemplateList,
  readTemplateResult,
  sanitizeMetaError,
  templatesEndpoint,
  type CreateTemplateInput,
  type ReviewTemplate,
  type TemplateMessageInput,
} from "@/lib/meta/review-validation";

// FERRAMENTA TEMPORÁRIA de App Review.
//
// Usa exclusivamente os ativos de TESTE fornecidos pela Meta, em variáveis
// próprias. Nunca lê credencial de cliente, nunca grava nada no banco e não
// encosta em Conversões, Dataset, CAPI, Embedded Signup, WAHA ou IA.
//
// O token vive só aqui dentro: não volta para o navegador, não entra em URL,
// não vai para log e não aparece em mensagem de erro.

const TIMEOUT_MS = 20_000;

// A versão da Graph vem do mesmo lugar que o resto do projeto. A ferramenta
// não pode falar uma versão diferente de Conversões — é a única coisa que ela
// reaproveita de lá, e só leitura de configuração.

export type ReviewConfig = {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
};

export type ReviewConfigStatus = {
  ready: boolean;
  // Só o NOME do que falta. Nenhum valor é exposto, nem parcialmente.
  missing: string[];
  hasPhoneNumberId: boolean;
  hasWabaId: boolean;
  hasAccessToken: boolean;
  graphVersion: string;
};

function readConfig(): Partial<ReviewConfig> {
  return {
    phoneNumberId: process.env.META_REVIEW_PHONE_NUMBER_ID?.trim(),
    wabaId: process.env.META_REVIEW_WABA_ID?.trim(),
    accessToken: process.env.META_REVIEW_ACCESS_TOKEN?.trim(),
  };
}

/** Diagnóstico para a tela: configurado ou não, nunca o valor. */
export function getReviewConfigStatus(): ReviewConfigStatus {
  const config = readConfig();
  const missing: string[] = [];

  if (!config.phoneNumberId) missing.push("META_REVIEW_PHONE_NUMBER_ID");
  if (!config.wabaId) missing.push("META_REVIEW_WABA_ID");
  if (!config.accessToken) missing.push("META_REVIEW_ACCESS_TOKEN");

  return {
    ready: missing.length === 0,
    missing,
    hasPhoneNumberId: Boolean(config.phoneNumberId),
    hasWabaId: Boolean(config.wabaId),
    hasAccessToken: Boolean(config.accessToken),
    graphVersion: getMetaGraphVersion(),
  };
}

function requireConfig(): ReviewConfig {
  const status = getReviewConfigStatus();

  if (!status.ready) {
    throw new ReviewToolError(
      `Configuração incompleta. Faltando: ${status.missing.join(", ")}.`,
    );
  }

  const config = readConfig();
  return config as ReviewConfig;
}

export class ReviewToolError extends Error {
  readonly code: number | null;
  readonly subcode: number | null;

  constructor(message: string, code: number | null = null, subcode: number | null = null) {
    super(message);
    this.name = "ReviewToolError";
    this.code = code;
    this.subcode = subcode;
  }
}

type GraphCall = {
  url: string;
  method: "GET" | "POST";
  token: string;
  body?: unknown;
  action: string;
};

async function callGraph({ url, method, token, body, action }: GraphCall) {
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        // O token só existe aqui, no cabeçalho, no servidor.
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Sem detalhe da requisição no log: ele carregaria o cabeçalho junto.
    console.error("[meta-review] falha de rede", { action });
    throw new ReviewToolError(
      "A Meta não respondeu a tempo. Tente novamente em alguns instantes.",
    );
  }

  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  // Log mínimo: ação, status e código da Meta. Nada de cabeçalho ou corpo.
  const sanitized = response.ok ? null : sanitizeMetaError(payload);
  console.info("[meta-review]", {
    action,
    status: response.status,
    metaCode: sanitized?.code ?? null,
    at: new Date().toISOString(),
  });

  if (!response.ok) {
    throw new ReviewToolError(
      sanitized?.message ?? "A Meta recusou a operação.",
      sanitized?.code ?? null,
      sanitized?.subcode ?? null,
    );
  }

  return payload;
}

/** Evidência de `whatsapp_business_messaging`. */
export async function sendReviewTemplateMessage(input: TemplateMessageInput) {
  const config = requireConfig();
  const version = getMetaGraphVersion();

  const payload = await callGraph({
    action: "send_template_message",
    method: "POST",
    url: messagesEndpoint(version, config.phoneNumberId),
    token: config.accessToken,
    body: buildTemplateMessageBody(input),
  });

  const result = readMessageResult(payload);

  return {
    ...result,
    // O identificador do número é público e ajuda na evidência do vídeo.
    phoneNumberId: config.phoneNumberId,
  };
}

/** Evidência de `whatsapp_business_management`. */
export async function createReviewTemplate(input: CreateTemplateInput) {
  const config = requireConfig();
  const version = getMetaGraphVersion();

  const payload = await callGraph({
    action: "create_message_template",
    method: "POST",
    url: templatesEndpoint(version, config.wabaId),
    token: config.accessToken,
    body: buildCreateTemplateBody(input),
  });

  return readTemplateResult(payload);
}

export async function listReviewTemplates(): Promise<ReviewTemplate[]> {
  const config = requireConfig();
  const version = getMetaGraphVersion();
  const url = new URL(templatesEndpoint(version, config.wabaId));
  url.searchParams.set("fields", "id,name,language,status,category");
  url.searchParams.set("limit", "50");

  const payload = await callGraph({
    action: "list_message_templates",
    method: "GET",
    url: url.toString(),
    token: config.accessToken,
  });

  return readTemplateList(payload);
}
