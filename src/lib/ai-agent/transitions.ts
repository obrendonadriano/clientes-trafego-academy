import "server-only";
import { aiAdminClient, AiAgentError } from "./store";

export async function transition(
  clientId: string,
  action: string,
  data: Record<string, unknown>,
) {
  const result = await aiAdminClient().rpc("ai_v2_transition", {
    p_client_id: clientId,
    p_action: action,
    p_data: data,
  });
  if (result.error)
    throw new AiAgentError(
      "Não foi possível atualizar o atendimento. Verifique se a atualização do banco foi aplicada.",
    );
  return result.data as {
    ok: boolean;
    conversationId?: string;
    revision?: number;
    schedule?: boolean;
    duplicate?: boolean;
    busy?: boolean;
    stale?: boolean;
    stopTyping?: boolean;
  };
}
