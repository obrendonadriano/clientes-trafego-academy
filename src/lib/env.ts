import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export function isSupabaseBrowserConfigured() {
  return Boolean(
    getSupabaseUrl() &&
      getSupabasePublishableKey(),
  );
}

export function isSupabaseAdminConfigured() {
  return Boolean(getSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isSupabaseConfigured() {
  return isSupabaseBrowserConfigured() && isSupabaseAdminConfigured();
}
