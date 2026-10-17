import "server-only";

import { getIntegrationSettingByProvider } from "@/lib/integrations";
import { whatsappNumberVariants } from "@/lib/ai-agent/shared";

const WAHA_TIMEOUT_MS = 15_000;

export type WahaCredentials = {
  baseUrl: string;
  apiKey: string;
};

export type WahaConfig = WahaCredentials & {
  webhookSecret: string;
  // LEGADO / TRANSITÓRIO. Captação de leads de Conversões pelo WAHA + n8n.
  // Continua ativo apenas para clientes em conversion_ingest_mode =
  // 'legacy_waha'. Quem já migrou é ignorado dentro de waha_ingest_lead.
  // Sai numa segunda migração, quando todos estiverem em 'official_meta'.
  leadsWebhookUrl: string | null;
};

export type WahaSessionStatus =
  | "STOPPED"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED";

export type WahaSession = {
  name?: string;
  status?: string;
  me?: {
    id?: string;
    pushName?: string;
  } | null;
};

export class WahaRequestError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "WahaRequestError";
    this.status = status;
  }
}

export function normalizeWahaBaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Informe uma URL válida do WAHA (ex.: https://waha.seudominio.com)." );
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("A URL do WAHA deve usar HTTP/HTTPS e não pode conter usuário ou senha.");
  }

  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !isLoopback) {
    throw new Error("Em produção, a URL do WAHA precisa usar HTTPS.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function normalizeWahaWebhookUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Informe uma URL válida do webhook de produção do n8n.");
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("O webhook do n8n deve usar HTTP/HTTPS e não pode conter usuário ou senha.");
  }

  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !isLoopback) {
    throw new Error("Em produção, o webhook do n8n precisa usar HTTPS.");
  }

  return url.toString();
}

function messageForStatus(status: number) {
  if (status === 401 || status === 403) {
    return "A WAHA_API_KEY foi recusada pelo WAHA. Confira a chave e tente novamente.";
  }

  if (status === 404) {
    return "O endereço informado não parece ser uma API WAHA válida.";
  }

  if (status === 429) {
    return "O WAHA limitou as requisições temporariamente. Aguarde um instante e tente novamente.";
  }

  if (status >= 500) {
    return "O servidor WAHA está indisponível no momento.";
  }

  return `O WAHA recusou a operação (HTTP ${status}).`;
}

export async function wahaFetchJson<T>(
  credentials: WahaCredentials,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Api-Key", credentials.apiKey);
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${credentials.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(WAHA_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new WahaRequestError("O servidor WAHA demorou demais para responder.");
    }

    throw new WahaRequestError(
      "Não foi possível alcançar o servidor WAHA. Confira a URL e se o serviço está online.",
    );
  }

  if (!response.ok) {
    throw new WahaRequestError(messageForStatus(response.status), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new WahaRequestError("O WAHA retornou uma resposta inválida.", response.status);
  }
}

export async function testWahaCredentials(credentials: WahaCredentials) {
  await wahaFetchJson<unknown[]>(credentials, "/api/sessions?all=true", {
    method: "GET",
  });
}

export async function getWahaConfig(): Promise<WahaConfig> {
  const integration = await getIntegrationSettingByProvider("waha");
  const baseUrl = integration?.config?.base_url ?? "";
  const apiKey = integration?.config?.api_key ?? "";
  const webhookSecret = integration?.config?.webhook_secret ?? "";
  const leadsWebhookUrl = integration?.config?.leads_webhook_url ?? "";

  if (!integration?.enabled || !baseUrl || !apiKey || !webhookSecret) {
    throw new WahaRequestError(
      "A conexão WAHA ainda não foi configurada pelo administrador.",
    );
  }

  return {
    baseUrl: normalizeWahaBaseUrl(baseUrl),
    apiKey,
    webhookSecret,
    leadsWebhookUrl: leadsWebhookUrl
      ? normalizeWahaWebhookUrl(leadsWebhookUrl)
      : null,
  };
}

export function toWahaSessionStatus(value: unknown): WahaSessionStatus {
  if (
    value === "STOPPED" ||
    value === "STARTING" ||
    value === "SCAN_QR_CODE" ||
    value === "WORKING" ||
    value === "FAILED"
  ) {
    return value;
  }

  return "FAILED";
}

export function wahaPhoneNumber(session: WahaSession) {
  return session.me?.id?.replace(/@.+$/, "").replace(/\D/g, "") || null;
}

// ---------------------------------------------------------------------------
// Envio de mensagens e presença.
//
// Endpoints do WAHA usados aqui (todos existentes na API Core):
//   POST /api/sendText        { session, chatId, text }
//   POST /api/startTyping     { session, chatId }
//   POST /api/stopTyping      { session, chatId }
//
// `sendText` já encerra o "digitando..." do lado do WhatsApp, então stopTyping
// só é chamado quando o envio falha e é preciso limpar o estado.
// ---------------------------------------------------------------------------

export type WahaSentMessage = {
  id?: string | { id?: string; _serialized?: string };
};

export async function sendWahaText(
  credentials: WahaCredentials,
  input: { session: string; chatId: string; text: string },
) {
  return wahaFetchJson<WahaSentMessage>(credentials, "/api/sendText", {
    method: "POST",
    body: JSON.stringify({
      session: input.session,
      chatId: input.chatId,
      text: input.text,
    }),
  });
}

/**
 * chatId real de um número no WhatsApp. Muitos celulares fora de SP estão
 * registrados sem o 9 da frente (5531 9524-8845 vira 553195248845@c.us), e o
 * envio para a forma errada falha. Pergunta ao WAHA qual forma existe.
 * Versões/engines sem o endpoint caem no formato padrão.
 */
export async function resolveWahaChatId(
  credentials: WahaCredentials,
  session: string,
  number: string,
) {
  let checked = false;

  for (const phone of whatsappNumberVariants(number)) {
    try {
      const result = await wahaFetchJson<{
        numberExists?: boolean;
        chatId?: string;
      }>(
        credentials,
        `/api/contacts/check-exists?phone=${phone}&session=${encodeURIComponent(session)}`,
        { method: "GET" },
      );
      checked = true;
      if (result?.numberExists && result.chatId) return result.chatId;
    } catch (error) {
      const unsupported =
        error instanceof WahaRequestError &&
        (error.status === 404 || error.status === 405 || error.status === 501);
      if (!unsupported) throw error;
    }
  }

  if (checked) {
    throw new WahaRequestError(
      "Este número não tem WhatsApp. Confira o DDD e o número.",
      404,
    );
  }

  return `${number.replace(/\D/g, "")}@c.us`;
}

export async function setWahaTyping(
  credentials: WahaCredentials,
  input: { session: string; chatId: string; typing: boolean },
) {
  const path = input.typing ? "/api/startTyping" : "/api/stopTyping";

  await wahaFetchJson<unknown>(credentials, path, {
    method: "POST",
    body: JSON.stringify({ session: input.session, chatId: input.chatId }),
  });
}

/** Normaliza o id que o WAHA devolve (string ou objeto) para texto. */
export function wahaMessageId(message: WahaSentMessage | null | undefined) {
  const id = message?.id;

  if (typeof id === "string") {
    return id;
  }

  return id?._serialized || id?.id || null;
}
