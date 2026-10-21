import { NextResponse } from "next/server";
import { z } from "zod";

import { guardOrigin, jsonError } from "@/lib/api-helpers";
import {
  consumePasswordResetToken,
  createSession,
  findPasswordResetToken,
  getRequestMeta,
  hashPassword,
  isSecureRequest,
  revokeAllSessions,
  setSessionCookie,
  validatePasswordStrength,
} from "@/lib/auth";
import { isAuthEnabled, prisma } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(200),
});

/**
 * Finish a password reset.
 *
 * On success every other session for the account is revoked — if the reset
 * was triggered because the password may have been compromised, the old
 * sessions must not survive it.
 */
export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return jsonError("Accounts are disabled because no DATABASE_URL is configured.", 503);
  }

  const originError = guardOrigin(request);
  if (originError) return originError;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return jsonError("That reset link is not valid.", 400);
  }

  const record = await findPasswordResetToken(parsed.data.token);
  if (!record) return jsonError("That reset link is not valid.", 400);
  if (record.usedAt) return jsonError("That reset link has already been used.", 400);
  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.passwordResetToken.delete({ where: { id: record.id } }).catch(() => undefined);
    return jsonError("That reset link has expired. Request a new one.", 400);
  }

  const passwordProblem = validatePasswordStrength(parsed.data.password, record.email);
  if (passwordProblem) return jsonError(passwordProblem, 400);

  const consumed = await consumePasswordResetToken(record.id);
  if (!consumed) return jsonError("That reset link has already been used.", 400);

  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });

  // Every previous session for this account is now invalid.
  await revokeAllSessions(record.userId);

  const { userAgent, ipAddress } = getRequestMeta(request);
  const { token, expiresAt } = await createSession(record.userId, { userAgent, ipAddress });
  setSessionCookie(token, expiresAt, isSecureRequest(request));

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json({ ok: true, user });
}
