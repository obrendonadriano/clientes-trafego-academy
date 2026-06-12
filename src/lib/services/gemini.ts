import { getIntegrationSettingByProvider } from "@/lib/integrations";

type GeminiRuntimeConfig = {
  model: string;
  apiKey: string;
};

const GEMINI_TIMEOUT_MS = 45_000;

export function generateMockGeminiAnalysis() {
  return `No período analisado, a campanha apresentou *boa consistência de entrega*, com *R$ 2.170,00 de investimento*, *388 resultados* e *CTR de 1,11%*, mostrando _presença forte da operação_ e uma condução segura ao longo da janela analisada.

De forma geral, foi um período *bom para a conta*, com *ROAS de 3,24x* e geração de leads compatível com o objetivo da campanha. Seguimos com uma visão positiva da performance e com uma base sólida de resultados para apresentar ao cliente.`;
}

export async function getGeminiRuntimeConfig(): Promise<GeminiRuntimeConfig | null> {
  const saved = await getIntegrationSettingByProvider("gemini");
  const model =
    saved?.config?.model ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";
  // api_key_hint é apenas a versão mascarada exibida na UI — nunca é uma
  // chave válida, por isso não entra como fallback.
  const apiKey = saved?.enabled
    ? saved.config?.api_key || process.env.GEMINI_API_KEY
    : process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return { model, apiKey };
}

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
  };
};

function mapGeminiHttpError(status: number): string {
  if (status === 429) {
    return "Limite de uso do Gemini atingido. Aguarde alguns minutos e tente novamente.";
  }

  if (status === 400 || status === 401 || status === 403) {
    return "API Key do Gemini inválida ou sem permissão. Revise a chave em Configurações.";
  }

  if (status >= 500) {
    return "O serviço do Gemini está instável no momento. Tente novamente em instantes.";
  }

  return `O Gemini retornou um erro inesperado (HTTP ${status}).`;
}

export async function generateGeminiAnalysis(prompt: string) {
  const config = await getGeminiRuntimeConfig();

  if (!config) {
    throw new Error(
      "Gemini não configurado. Salve a API Key nas configurações e ative a integração.",
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        "O Gemini demorou demais para responder. Tente gerar a análise novamente.",
      );
    }

    throw new Error("Não foi possível conectar ao Gemini. Verifique a conexão.");
  }

  if (!response.ok) {
    throw new Error(mapGeminiHttpError(response.status));
  }

  let data: GeminiResponse;

  try {
    data = (await response.json()) as GeminiResponse;
  } catch {
    throw new Error("O Gemini retornou uma resposta inválida. Tente novamente.");
  }

  if (data.error?.message) {
    throw new Error(`O Gemini retornou um erro: ${data.error.message}`);
  }

  const candidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;

  if (candidate?.finishReason === "SAFETY") {
    throw new Error(
      "O Gemini bloqueou esta análise por política de segurança. Ajuste o período ou tente novamente.",
    );
  }

  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim()
    : "";

  if (!text) {
    throw new Error("O Gemini não retornou texto para esta análise. Tente novamente.");
  }

  return text;
}
