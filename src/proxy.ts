import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/env";
import { getUserById } from "@/lib/mock-data";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  if (isSupabaseConfigured()) {
    return refreshSupabaseSession(request);
  }

  const session = request.cookies.get("ta_session")?.value;
  const user = session ? getUserById(session) : null;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/login") && user) {
    const url = request.nextUrl.clone();
    url.pathname = user.role === "admin" ? "/admin" : "/dashboard";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin")) {
    if (!user) {
      return redirectToLogin(request);
    }

    if (user.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/dashboard")) {
    if (!user) {
      return redirectToLogin(request);
    }

    if (user.role !== "client") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

// Renova o access token do Supabase (que expira em ~1h) a cada navegação e
// grava os cookies atualizados na resposta. É o que mantém o cliente logado
// sem precisar relogar toda hora — padrão oficial Supabase + Next.
async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = getSupabaseUrl();
  const anonKey = getSupabasePublishableKey();

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/login", "/admin/:path*", "/dashboard/:path*"],
};
