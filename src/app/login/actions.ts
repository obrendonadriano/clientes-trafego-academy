"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateUser } from "@/lib/auth/mock-auth";
import { isDevelopmentAuthFallbackEnabled } from "@/lib/auth/mode";
import { signInWithSupabase, signOutFromSupabase } from "@/lib/auth/supabase-auth";
import { isSupabaseConfigured } from "@/lib/env";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  let result = isSupabaseConfigured()
    ? await signInWithSupabase(username, password)
    : authenticateUser(username, password);

  if (!result && isDevelopmentAuthFallbackEnabled()) {
    result = authenticateUser(username, password);
  }

  if (!result) {
    return {
      error: "Usuário, email ou senha inválidos.",
    };
  }

  if (!isSupabaseConfigured() || isDevelopmentAuthFallbackEnabled()) {
    (await cookies()).set("ta_session", result.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }

  redirect(result.role === "admin" ? "/admin" : "/dashboard");
}

export async function logoutAction() {
  if (isSupabaseConfigured()) {
    await signOutFromSupabase();
  }

  (await cookies()).delete("ta_session");
  redirect("/login");
}
