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

  // A sessão já foi validada pelo DAL antes de montar o shell. A RLS determina
  // qual linha o cliente pode ler, sem repetir uma chamada de Auth pela rede.
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

  // Para o admin, a própria policy libera todas as linhas. O DAL já validou a
  // sessão antes desta consulta, e a RLS segue sendo a barreira de segurança.
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
