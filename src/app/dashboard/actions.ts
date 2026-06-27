"use server";

import { revalidatePath } from "next/cache";
import { getOptionalCurrentUser } from "@/lib/auth/session";
import { getMetaSyncStatus, runMetaSync } from "@/lib/sync/meta-sync";

export type ClientMetricsRefreshState = {
  success?: string;
  error?: string;
};

// Janela mínima entre sincronizações reais disparadas pelo botão do cliente.
// Como cada execução roda o sync completo de TODAS as contas na Meta (que tem
// rate limit), isso evita martelar a API quando vários clientes clicam quase
// ao mesmo tempo ou em cliques repetidos. Em uso normal é invisível.
const CLIENT_REFRESH_COOLDOWN_MS = 90 * 1000;

// Botão "Atualizar métricas" da área do cliente. Dispara exatamente a mesma
// sincronização do admin (atualiza todas as contas), mas a resposta é neutra:
// não devolve contagens nem nada que revele as campanhas de outros clientes.
export async function refreshClientMetricsAction(
  prevState: ClientMetricsRefreshState,
  formData: FormData,
): Promise<ClientMetricsRefreshState> {
  void prevState;
  void formData;

  const user = await getOptionalCurrentUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente para atualizar." };
  }

  // Cooldown: se acabou de sincronizar, não refaz a chamada à Meta.
  const status = await getMetaSyncStatus();
  if (status.lastSuccessAt) {
    const elapsed = Date.now() - new Date(status.lastSuccessAt).getTime();
    if (elapsed >= 0 && elapsed < CLIENT_REFRESH_COOLDOWN_MS) {
      return { success: "As métricas já estão atualizadas." };
    }
  }

  try {
    await runMetaSync();
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/campanhas");
    return { success: "Métricas atualizadas com sucesso." };
  } catch {
    // runMetaSync detalha o erro (ex.: token), mas o cliente não precisa ver
    // mensagens técnicas de contas que não são dele.
    return {
      error:
        "Não foi possível atualizar as métricas agora. Tente novamente em alguns minutos.",
    };
  }
}
