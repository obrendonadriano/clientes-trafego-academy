import "server-only";

import { getIntegrationSettingByProvider } from "@/lib/integrations";

// Cliente do DeepSeek para o atendimento por IA. A API é compatível com o
// formato OpenAI de chat/completions, então o corpo segue esse mesmo padrão.
// A chave nunca sai do servidor: fica em integration_settings ou no ambiente.

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_TIMEOUT_MS = 40_000;

export { DEEPSEEK_MODELS } from "@/lib/services/deepseek-models";

export type DeepseekRuntimeConfig = {
  model: string;
  apiKey: string;
};

export type DeepseekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class DeepseekError extends Error {
  // Erros temporários podem ser repetidos numa próxima mensagem do lead.
  retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "DeepseekError";
    this.retryable = retryable;
  }
}

export async function getDeepseekRuntimeConfig(): Promise<DeepseekRuntimeConfig | null> {
  const saved = await getIntegrationSettingByProvider("deepseek");
  const model =
    saved?.config?.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const apiKey = saved?.enabled
    ? saved.config?.api_key || process.env.DEEPSEEK_API_KEY
    : process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return null;
  }

  return { model, apiKey };
}

export async function testDeepseekCredentials(apiKey: string) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new DeepseekError(mapDeepseekHttpError(response.status));
  }
}

function mapDeepseekHttpError(status: number): string {
  if (status === 401 || status === 403) {
    return "API Key do DeepSeek inválida ou sem permissão.";
  }

  if (status === 402) {
    return "A conta do DeepSeek está sem saldo. Recarregue para continuar usando a IA.";
  }

  if (status === 429) {
    return "Limite de uso do DeepSeek atingido. Tente novamente em instantes.";
  }

  if (status >= 500) {
    return "O serviço do DeepSeek está instável no momento.";
  }

  return `O DeepSeek retornou um erro inesperado (HTTP ${status}).`;
}

type DeepseekResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
};

/**
 * Pede uma resposta em JSON ao DeepSeek.
 *
 * Usa `response_format: json_object`, que obriga o modelo a devolver um JSON
 * sintaticamente válido. Isso **não** garante o formato esperado — quem
 * valida o schema é quem chama (ver `ai-agent/engine.ts`).
 */
export async function generateDeepseekJson(
  messages: DeepseekMessage[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const config = await getDeepseekRuntimeConfig();

  if (!config) {
    throw new DeepseekError(
      "DeepSeek não configurado. Salve a API Key em Configurações e ative a integração.",
    );
  }

  let response: Response;

  try {
    response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        response_format: { type: "json_object" },
        temperature: options.temperature ?? 0.6,
        max_tokens: options.maxTokens ?? 900,
        stream: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new DeepseekError("O DeepSeek demorou demais para responder.", true);
    }

    throw new DeepseekError("Não foi possível conectar ao DeepSeek.", true);
  }

  if (!response.ok) {
    throw new DeepseekError(
      mapDeepseekHttpError(response.status),
      response.status === 429 || response.status >= 500,
    );
  }

  let data: DeepseekResponse;

  try {
    data = (await response.json()) as DeepseekResponse;
  } catch {
    throw new DeepseekError("O DeepSeek retornou uma resposta ilegível.", true);
  }

  if (data.error?.message) {
    throw new DeepseekError(`O DeepSeek retornou um erro: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new DeepseekError("O DeepSeek não retornou conteúdo.", true);
  }

  return content;
}
