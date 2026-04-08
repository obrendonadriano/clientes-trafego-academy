import { getIntegrationSettingByProvider } from "@/lib/integrations";

type GeminiRuntimeConfig = {
  model: string;
  apiKey: string;
};

export function generateMockGeminiAnalysis() {
  return `Resumo executivo:

No período analisado, as campanhas apresentaram uma entrega consistente, com boa geração de resultados e uma leitura positiva da operação. O desempenho observado reforça a solidez do trabalho conduzido ao longo da janela avaliada.

Destaques da performance:
- volume de resultados alinhado ao investimento aplicado;
- consistência nos indicadores principais de tráfego e conversão;
- presença estável das campanhas ao longo do período analisado.

Leitura consultiva para o cliente:
O cenário geral é favorável e mostra uma condução estratégica bem estruturada. A campanha seguiu com presença relevante, geração de leads e indicadores que sustentam uma percepção positiva da performance apresentada.

Encerramento positivo:
Seguimos com uma leitura muito boa deste período, reforçando a evolução da operação e a consistência do trabalho realizado para a conta.`;
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
