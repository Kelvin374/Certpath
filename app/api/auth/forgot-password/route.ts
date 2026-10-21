import { NextResponse } from "next/server";
import { z } from "zod";

import { appOrigin, guardOrigin, jsonError } from "@/lib/api-helpers";
import { createPasswordResetToken, getRequestMeta } from "@/lib/auth";
import { isAuthEnabled, prisma } from "@/lib/db";
import { getAdapter, passwordResetMessage, sendEmail } from "@/lib/email";
import { checkLoginAllowed, recordLoginAttempt } from "@/lib/login-throttle";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email().max(200),
});

/**
 * Start a password reset.
 *
 * The response is identical whether or not the address is registered, so the
 * endpoint cannot be used to discover who has an account.
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
    return jsonError("Enter a valid email address.", 400);
  }

  const email = parsed.data.email.toLowerCase();
  const { ipAddress } = getRequestMeta(request);

  const throttle = await checkLoginAllowed(`reset:${email}`, ipAddress);
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later.", retryAfterSeconds: throttle.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Spend comparable time so the response does not reveal that the address
    // is unknown.
    await recordLoginAttempt(`reset:${email}`, ipAddress, false);
    return NextResponse.json({
      ok: true,
      message: "If that address has a CertPath account, a reset link is on its way.",
    });
  }

  const token = await createPasswordResetToken(user.id);
  const resetUrl = `${appOrigin(request)}/reset-password?token=${encodeURIComponent(token)}`;

  await sendEmail(passwordResetMessage(user.email, resetUrl));
  await recordLoginAttempt(`reset:${email}`, ipAddress, true);

  // With no mail transport configured the link is returned so the flow is
  // usable in development. It is never returned once a real adapter is set.
  const devLink = getAdapter().name === "console" ? resetUrl : undefined;

  return NextResponse.json({
    ok: true,
    message: "If that address has a CertPath account, a reset link is on its way.",
    ...(devLink ? { devResetUrl: devLink } : {}),
  });
}
