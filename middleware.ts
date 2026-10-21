import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route protection.
 *
 * This is the fast gate: it only confirms a session cookie is present. The
 * cookie is an opaque random token, and it is validated against the database
 * server-side on every request — the app layout performs that check, so a
 * stale or revoked cookie is caught before any page renders.
 *
 * When no `DATABASE_URL` is configured the platform runs without accounts and
 * this middleware steps aside.
 */
const SESSION_COOKIE = "certpath_session";

const PROTECTED = [
  "/dashboard",
  "/quiz",
  "/flashcards",
  "/planner",
  "/readiness",
  "/buddy",
  "/account",
];

export function middleware(request: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/quiz/:path*",
    "/flashcards/:path*",
    "/planner/:path*",
    "/readiness/:path*",
    "/buddy/:path*",
    "/account/:path*",
  ],
};
