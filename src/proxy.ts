import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const protectedPrefixes = ["/drafts", "/builder", "/api/policycraft"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth")) return NextResponse.next();

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const draftsUrl = new URL(request.url);
    draftsUrl.pathname = `/drafts${pathname.slice("/dashboard".length)}`;
    return NextResponse.redirect(draftsUrl);
  }

  if (!protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }
  if (getSessionCookie(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/drafts/:path*", "/builder/:path*", "/api/policycraft/:path*", "/login"],
};
