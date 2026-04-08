import { getIntegrationSettingByProvider } from "@/lib/integrations";

type GeminiRuntimeConfig = {
  model: string;
  apiKey: string;
};

export function generateMockGeminiAnalysis() {
  return `Resumo executivo:

No período analisado, as campanhas mantiveram crescimento saudável de volume com boa eficiência geral. A campanha principal concentrou o melhor retorno, com ROAS mais forte e custo por lead controlado, indicando aderência entre segmentação, criativos e oferta.

Pontos positivos:
- evolução de leads sem aumento desproporcional do investimento;
- CTR consistente, sinalizando boa atratividade dos anúncios;
- maior previsibilidade nas campanhas de intenção alta.

Alertas:
- o remarketing ainda apresenta custo por lead acima da média da conta;
- alguns conjuntos podem entrar em fadiga se a frequência continuar subindo.

Oportunidades:
- redistribuir parte do orçamento para os anúncios com melhor ROAS;
- testar novos criativos no remarketing;
- revisar públicos mornos para ampliar conversão sem elevar CPC.

Leitura consultiva:
O cenário é positivo e mostra maturidade operacional. A recomendação é manter o que já está performando bem, enquanto refinamos os pontos de ineficiência para ganhar margem e previsibilidade nas próximas semanas.`;
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
