"use server";

import { revalidatePath } from "next/cache";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { AiAgentError, setAiAllPlans } from "@/lib/ai-agent/store";

export type AiAllPlansState = { success?: string; error?: string };

// Interruptor de Configurações: libera o Atendimento IA para todos os planos.
export async function setAiAllPlansAction(enabled: boolean): Promise<AiAllPlansState> {
  const user = await getOptionalCurrentUser();
  if (!user || user.role !== "admin" || !user.active) {
    return { error: "Só um administrador pode alterar a liberação da IA." };
  }

  try {
    await setAiAllPlans(enabled);
  } catch (error) {
    return {
      error:
        error instanceof AiAgentError
          ? error.message
          : "Não foi possível salvar a liberação da IA.",
    };
  }

  revalidatePath("/admin/configuracoes");
  revalidatePath("/dashboard/atendimento-ia");
  return {
    success: enabled
      ? "Atendimento IA liberado para todos os planos."
      : "Atendimento IA voltou a ser exclusivo do Plano Completo.",
  };
}
