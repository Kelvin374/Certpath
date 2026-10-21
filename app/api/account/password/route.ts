import { NextResponse } from "next/server";
import { z } from "zod";

import { guardOrigin, jsonError, requireUser } from "@/lib/api-helpers";
import {
  hashPassword,
  readSessionToken,
  revokeAllSessions,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

/**
 * Change the account password.
 *
 * The current password is required, so a stolen session alone cannot lock the
 * owner out. Every other session is revoked afterwards; the current one stays
 * signed in.
 */
export async function POST(request: Request) {
  const originError = guardOrigin(request);
  if (originError) return originError;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) return jsonError("Enter your current and new password.", 400);

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return jsonError("Not signed in.", 401);

  const currentOk = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!currentOk) return jsonError("Your current password is incorrect.", 403);

  const problem = validatePasswordStrength(parsed.data.newPassword, user.email);
  if (problem) return jsonError(problem, 400);

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return jsonError("Choose a password different from your current one.", 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  // Sign out every other device; keep this one.
  const currentToken = readSessionToken();
  const revoked = await revokeAllSessions(user.id, currentToken);

  return NextResponse.json({ ok: true, revoked });
}
