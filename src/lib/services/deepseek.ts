import "server-only";

import { getIntegrationSettingByProvider } from "@/lib/integrations";
import { withTransientRetry } from "@/lib/ai-agent/retry";

// Cliente do DeepSeek para o atendimento por IA. A API é compatível com o
// formato OpenAI de chat/completions, então o corpo segue esse mesmo padrão.
// A chave nunca sai do servidor: fica em integration_settings ou no ambiente.

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_TIMEOUT_MS = 20_000;


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
async function generateDeepseekJsonOnce(
  messages: DeepseekMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    config?: DeepseekRuntimeConfig;
  } = {},
): Promise<string> {
  const config = options.config ?? (await getDeepseekRuntimeConfig());

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
      signal: AbortSignal.timeout(options.timeoutMs ?? DEEPSEEK_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new DeepseekError(
        "O DeepSeek demorou demais para responder.",
        true,
      );
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
    throw new DeepseekError("O DeepSeek recusou a solicitação.");
  }

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new DeepseekError("O DeepSeek não retornou conteúdo.", true);
  }

  return extractJsonText(content);
}

/**
 * Modelos mais novos às vezes cercam o JSON: raciocínio em <think>…</think>,
 * bloco ```json … ``` ou uma frase antes/depois. Devolve só o objeto JSON
 * quando ele existe; senão, o texto original (quem chama decide o erro).
 */
export function extractJsonText(content: string) {
  const text = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]?.trim();
  const candidates = [text, fenced].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const slice = candidate.slice(start, end + 1);
        try {
          JSON.parse(slice);
          return slice;
        } catch {
          // Segue para o próximo candidato.
        }
      }
    }
  }

  return text || content;
}

export async function generateDeepseekJson(
  messages: DeepseekMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    config?: DeepseekRuntimeConfig;
  } = {},
) {
  return withTransientRetry(() => generateDeepseekJsonOnce(messages, options));
}

/** Modelos que a conta do DeepSeek oferece hoje (GET /models). */
export async function listDeepseekModels(apiKey: string): Promise<string[]> {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new DeepseekError(mapDeepseekHttpError(response.status));
  }

  const payload = (await response.json()) as { data?: { id?: string }[] };
  return [
    ...new Set(
      (payload.data ?? [])
        .map((model) => model.id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ].sort();
}

/**
 * Confere se o modelo funciona do jeito que o Atendimento IA usa: uma chamada
 * mínima em modo JSON. Modelo que não responde JSON válido não é salvo.
 */
export async function probeDeepseekModel(config: DeepseekRuntimeConfig) {
  const raw = await generateDeepseekJson(
    [
      { role: "system", content: 'Responda somente com o JSON {"ok": true}.' },
      { role: "user", content: "Teste de configuração." },
    ],
    // Folga para modelos que "pensam" antes de responder.
    { temperature: 0, maxTokens: 400, timeoutMs: 30_000, config },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const preview = raw.replace(/\s+/g, " ").slice(0, 80);
    throw new DeepseekError(
      `O modelo não respondeu em JSON (veio: "${preview}"). Escolha outro modelo.`,
    );
  }

  if (!parsed || typeof parsed !== "object" || (parsed as { ok?: unknown }).ok !== true) {
    throw new DeepseekError("O modelo respondeu fora do formato esperado. Escolha outro modelo.");
  }
}
