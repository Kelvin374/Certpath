import { NextResponse } from "next/server";

import { guardOrigin, jsonError, requireUser } from "@/lib/api-helpers";
import { revokeSession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Revoke a single session.
 *
 * The session must belong to the signed-in account, so one user can never
 * revoke another's session by guessing an id.
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const originError = guardOrigin(request);
  if (originError) return originError;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const revoked = await revokeSession(params.id, auth.user.id);
  if (!revoked) return jsonError("That session does not exist.", 404);

  return NextResponse.json({ ok: true });
}
