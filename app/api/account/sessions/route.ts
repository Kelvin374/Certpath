import { NextResponse } from "next/server";

import { guardOrigin, requireUser } from "@/lib/api-helpers";
import { listSessions, readSessionToken, revokeAllSessions } from "@/lib/auth";

export const runtime = "nodejs";

/** List the devices signed in to this account. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  return NextResponse.json({ sessions: await listSessions(auth.user.id) });
}

/**
 * Sign out every *other* device.
 *
 * The current session survives, so the user stays signed in on the device they
 * are looking at. `/api/auth/logout-all` is the variant that ends the
 * current session too.
 */
export async function DELETE(request: Request) {
  const originError = guardOrigin(request);
  if (originError) return originError;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const revoked = await revokeAllSessions(auth.user.id, readSessionToken());

  return NextResponse.json({ ok: true, revoked });
}
