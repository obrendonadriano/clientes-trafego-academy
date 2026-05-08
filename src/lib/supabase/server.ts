import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

type SupabaseServerClientOptions = {
  allowCookieWrites?: boolean;
};

export async function createSupabaseServerClient({
  allowCookieWrites = false,
}: SupabaseServerClientOptions = {}) {
  const url = getSupabaseUrl();
  const anonKey = getSupabasePublishableKey();

  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (!allowCookieWrites) {
          return;
        }

        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });
}
