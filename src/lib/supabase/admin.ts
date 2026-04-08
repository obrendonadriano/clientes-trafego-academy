import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseUrl } from "@/lib/supabase/env";

export function createSupabaseAdminClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  return createClient(
    getSupabaseUrl()!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
