import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getMobileAccessToken } from "@/lib/auth/mobile-context";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

type SupabaseServerClientOptions = {
  allowCookieWrites?: boolean;
};

function createSupabaseCookieClient(
  url: string,
  anonKey: string,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  allowCookieWrites: boolean,
) {
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

// Cliente com o JWT do app mobile: o Postgres aplica a mesma RLS da sessão por
// cookie. Sem sessão persistida, getUser/getClaims precisam receber o token.
function createSupabaseMobileClient(
  url: string,
  anonKey: string,
  accessToken: string,
) {
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const getUser = client.auth.getUser.bind(client.auth);
  const getClaims = client.auth.getClaims.bind(client.auth);

  client.auth.getUser = ((jwt?: string) =>
    getUser(jwt ?? accessToken)) as typeof client.auth.getUser;
  client.auth.getClaims = ((
    jwt?: string,
    options?: Parameters<typeof getClaims>[1],
  ) => getClaims(jwt ?? accessToken, options)) as typeof client.auth.getClaims;

  return client as unknown as ReturnType<typeof createSupabaseCookieClient>;
}

export async function createSupabaseServerClient({
  allowCookieWrites = false,
}: SupabaseServerClientOptions = {}) {
  const url = getSupabaseUrl();
  const anonKey = getSupabasePublishableKey();

  if (!url || !anonKey) {
    return null;
  }

  const mobileToken = getMobileAccessToken();

  if (mobileToken) {
    return createSupabaseMobileClient(url, anonKey, mobileToken);
  }

  return createSupabaseCookieClient(
    url,
    anonKey,
    await cookies(),
    allowCookieWrites,
  );
}
