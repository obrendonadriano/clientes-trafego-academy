import { z } from "zod";
import { advanceConversation, authenticateAiWebhook } from "@/lib/ai-agent/pipeline";
import { AiAgentError } from "@/lib/ai-agent/store";

// Segundo passo do fluxo do n8n. Cada chamada avança UM passo da conversa
// (gerar resposta, ligar o "digitando", enviar uma mensagem) e devolve quanto
// tempo o n8n deve esperar antes de chamar de novo. Toda a espera acontece no
// n8n justamente porque a app roda em serverless.
export const maxDuration = 60;

const stepSchema = z.object({
  sessionName: z.string().min(1),
  chatId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await authenticateAiWebhook(request);

    const parsed = stepSchema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json(
        { acao: "fim", motivo: "Informe sessionName e chatId." },
        { status: 400 },
      );
    }

    return Response.json(await advanceConversation(parsed.data));
  } catch (error) {
    const status = error instanceof AiAgentError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "Falha ao avançar a conversa.";

    console.error("[ia/passo] falha", { status, message });
    return Response.json({ acao: "fim", erro: message }, { status });
  }
}
