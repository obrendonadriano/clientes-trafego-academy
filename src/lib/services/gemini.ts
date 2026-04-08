import { getIntegrationSettingByProvider } from "@/lib/integrations";

type GeminiRuntimeConfig = {
  model: string;
  apiKey: string;
};

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
  const apiKey =
    saved?.enabled
      ? saved.config?.api_key || saved.config?.api_key_hint || process.env.GEMINI_API_KEY
      : process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return { model, apiKey };
}

export async function generateGeminiAnalysis(prompt: string) {
  const config = await getGeminiRuntimeConfig();

  if (!config) {
    throw new Error(
      "Gemini não configurado. Salve a API Key nas configurações e ative a integração.",
    );
  }

  const response = await fetch(
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
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini retornou erro: ${body}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!text) {
    throw new Error("O Gemini não retornou texto para esta análise.");
  }

  return text;
}
