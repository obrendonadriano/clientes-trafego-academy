import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isDevelopmentAuthFallbackEnabled } from "@/lib/auth/mode";
import { isSupabaseConfigured } from "@/lib/env";
import { getUserById } from "@/lib/mock-data";
import { getSupabaseCurrentUser } from "@/lib/auth/supabase-auth";
import type { User } from "@/lib/types";

export async function getCurrentUser(): Promise<User> {
  const user = await getOptionalCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

const getOptionalCurrentUserCached = cache(async () => {
  if (isSupabaseConfigured()) {
    const supabaseUser = await getSupabaseCurrentUser();

    if (supabaseUser) {
      return supabaseUser;
    }

    if (isDevelopmentAuthFallbackEnabled()) {
      return getFallbackCurrentUser();
    }

    return null;
  }

  return getFallbackCurrentUser();
});

// Layouts, pages e Server Actions frequentemente pedem o mesmo usuário na
// mesma renderização. React.cache mantém uma única validação de sessão e uma
// única leitura do perfil por request, sem compartilhar usuário entre requests.
export async function getOptionalCurrentUser() {
  return getOptionalCurrentUserCached();
}

async function getFallbackCurrentUser() {
  const session = (await cookies()).get("ta_session")?.value;
  return session ? getUserById(session) : null;
}
