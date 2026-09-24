import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminConnectionOverview } from "@/lib/data/whatsapp-connection";

// Estado de um cliente para o card de configuração manual na tela de perfil.
//
// O caminho normal é o cliente conectar sozinho pelo Embedded Signup, que
// descobre WABA, número e Dataset. Este card continua existindo como saída de
// emergência do administrador e por compatibilidade com clientes configurados
// à mão antes da integração oficial. O token nunca volta pela API: só o
// indicador de que existe um.

export async function getClientCapiConfig(clientId: string) {
  const overview = await getAdminConnectionOverview();
  const found = overview.clients.find((item) => item.clientId === clientId);

  // Trocar o modelo de conversão com fechamentos já registrados pede
  // confirmação: o formulário só mostra o aviso quando existe histórico.
  let hasConversionHistory = false;
  const admin = createSupabaseAdminClient();

  if (admin) {
    const { count } = await admin
      .from("conversion_leads")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("qualificacao", "fechado");

    hasConversionHistory = (count ?? 0) > 0;
  }

  return {
    clientId,
    datasetId: found?.datasetId ?? "",
    wabaId: found?.wabaId ?? "",
    capiAtivo: found?.capiAtivo ?? false,
    tokenConfigurado: found?.tokenConfigurado ?? false,
    goalType: found?.goalType ?? "vehicle_acquisition",
    hasConversionHistory,
  };
}
