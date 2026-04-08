import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

export async function getOptionalCurrentUser() {
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
}

async function getFallbackCurrentUser() {
  const session = (await cookies()).get("ta_session")?.value;
  return session ? getUserById(session) : null;
}
