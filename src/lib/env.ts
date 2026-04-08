import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export function isSupabaseConfigured() {
  return Boolean(
    getSupabaseUrl() &&
      getSupabasePublishableKey() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
