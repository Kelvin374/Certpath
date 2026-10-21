import { NextResponse } from "next/server";

import { guardOrigin, jsonError, requireUser } from "@/lib/api-helpers";
import { clearSessionCookie, isSecureRequest, revokeAllSessions, readSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Sign out everywhere.
 *
 * Every session for the account is revoked, including this one, so the
 * cookie is cleared as well.
 */
export async function POST(request: Request) {
  const originError = guardOrigin(request);
  if (originError) return originError;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const revoked = await revokeAllSessions(auth.user.id);
  clearSessionCookie(isSecureRequest(request));

  return NextResponse.json({ ok: true, revoked });
}
