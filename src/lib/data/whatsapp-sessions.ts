import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  mapWhatsappSessionRow,
  WHATSAPP_SESSION_COLUMNS,
  type WhatsappSession,
  type WhatsappSessionRow,
} from "@/lib/whatsapp-session";

export async function getCurrentWhatsappSession(): Promise<WhatsappSession | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return null;
  }

  // A RLS determina qual linha o cliente pode ler. Não enviamos client_id.
  const { data, error } = await supabase
    .from("whatsapp_sessions")
    .select(WHATSAPP_SESSION_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapWhatsappSessionRow(data as WhatsappSessionRow);
}

export async function getAllWhatsappSessions(): Promise<{
  sessions: WhatsappSession[];
  notice?: string;
}> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { sessions: [] };
  }

  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { sessions: [], notice: "Entre novamente para consultar as conexões." };
  }

  // Para o admin, a própria policy libera todas as linhas.
  const { data, error } = await supabase
    .from("whatsapp_sessions")
    .select(WHATSAPP_SESSION_COLUMNS);

  if (error) {
    return { sessions: [], notice: error.message };
  }

  return {
    sessions: ((data as WhatsappSessionRow[] | null) ?? []).map(
      mapWhatsappSessionRow,
    ),
  };
}

