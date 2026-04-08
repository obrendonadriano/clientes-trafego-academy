import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getUserById } from "@/lib/mock-data";

export function proxy(request: NextRequest) {
  if (isSupabaseConfigured()) {
    return NextResponse.next();
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

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/login", "/admin/:path*", "/dashboard/:path*"],
};
