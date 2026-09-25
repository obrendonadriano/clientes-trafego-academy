import {
  authenticateAiWebhook,
  ingestInboundEvent,
  parseIncomingEvent,
} from "@/lib/ai-agent/pipeline";
import { AiAgentError } from "@/lib/ai-agent/store";

// Primeiro passo do fluxo do n8n: o evento "message" do WAHA chega aqui e a
// mensagem é gravada de forma idempotente. A resposta diz ao n8n se vale a
// pena esperar o debounce e chamar /whatsapp/ia/passo.
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await authenticateAiWebhook(request);

    const event = parseIncomingEvent(await request.json());

    if (!event) {
      return Response.json(
        { acao: "ignorar", motivo: "Evento sem sessão ou remetente." },
        { status: 200 },
      );
    }

    return Response.json(await ingestInboundEvent(event));
  } catch (error) {
    return aiErrorResponse("ia/evento", error);
  }
}

function aiErrorResponse(scope: string, error: unknown) {
  const status = error instanceof AiAgentError ? error.status : 500;
  const message =
    error instanceof AiAgentError
      ? error.message
      : "Falha ao processar o evento.";

  // Log interno sem telefone, prompt ou conteúdo de conversa.
  console.error(`[${scope}] falha`, { status, message });

  return Response.json({ acao: "fim", erro: message }, { status });
}
