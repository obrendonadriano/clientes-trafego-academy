// Configuração de webhooks de uma sessão WAHA. Usada ao conectar o WhatsApp e
// na atualização em massa do admin, para as duas nunca divergirem.

const RETRIES = {
  policy: "exponential",
  delaySeconds: 2,
  attempts: 10,
} as const;

type Webhook = {
  url: string;
  events: string[];
  hmac: { key: string };
  retries: typeof RETRIES;
  customHeaders?: { name: string; value: string }[];
};

export function buildWahaSessionPayload(input: {
  sessionName: string;
  webhookSecret: string;
  statusWebhookUrl: string;
  // LEGADO / TRANSITÓRIO: captação de Conversões pelo WAHA (n8n).
  leadsWebhookUrl: string | null;
  // Atendimento IA direto no site; null fora do segmento de veículos.
  aiWebhookUrl: string | null;
}) {
  const messageWebhook = (
    url: string,
    event: "message" | "message.any",
  ): Webhook => ({
    url,
    events: [event],
    hmac: { key: input.webhookSecret },
    customHeaders: [
      { name: "X-TrafegoAcademy-Secret", value: input.webhookSecret },
    ],
    retries: RETRIES,
  });

  const webhooks: Webhook[] = [
    {
      url: input.statusWebhookUrl,
      events: ["session.status"],
      hmac: { key: input.webhookSecret },
      retries: RETRIES,
    },
  ];

  if (input.leadsWebhookUrl) {
    webhooks.push(messageWebhook(input.leadsWebhookUrl, "message"));
  }

  // A IA precisa também das respostas manuais (fromMe) para pausar o robô.
  if (input.aiWebhookUrl) {
    webhooks.push(messageWebhook(input.aiWebhookUrl, "message.any"));
  }

  return {
    name: input.sessionName,
    config: {
      metadata: { source: "trafegoacademy" },
      webhooks,
    },
  };
}
