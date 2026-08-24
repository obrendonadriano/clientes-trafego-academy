import "server-only";

import { getIntegrationSettingByProvider } from "@/lib/integrations";

const WAHA_TIMEOUT_MS = 15_000;

export type WahaCredentials = {
  baseUrl: string;
  apiKey: string;
};

export type WahaConfig = WahaCredentials & {
  webhookSecret: string;
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

  if (!integration?.enabled || !baseUrl || !apiKey || !webhookSecret) {
    throw new WahaRequestError(
      "A conexão WAHA ainda não foi configurada pelo administrador.",
    );
  }

  return {
    baseUrl: normalizeWahaBaseUrl(baseUrl),
    apiKey,
    webhookSecret,
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
