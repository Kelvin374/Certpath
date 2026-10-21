import { NextResponse } from "next/server";
import { z } from "zod";

import { appOrigin, guardOrigin, jsonError, throttleResponse } from "@/lib/api-helpers";
import {
  createSession,
  getRequestMeta,
  hashPassword,
  setSessionCookie,
  isSecureRequest,
  validatePasswordStrength,
} from "@/lib/auth";
import { isAuthEnabled, prisma } from "@/lib/db";
import { checkLoginAllowed, recordLoginAttempt } from "@/lib/login-throttle";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(200),
  password: z
    .string()
    .min(1, "Enter a password")
    .max(200, "That password is too long"),
  name: z.string().trim().max(80).optional(),
});

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
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid details.", 400);
  }

  const email = parsed.data.email.toLowerCase();
  const { userAgent, ipAddress } = getRequestMeta(request);

  // Throttle registration attempts per address so the endpoint cannot be used
  // to spray accounts or enumerate addresses.
  const throttle = await checkLoginAllowed(`register:${email}`, ipAddress);
  if (!throttle.allowed) return throttleResponse(throttle);

  const passwordProblem = validatePasswordStrength(parsed.data.password, email);
  if (passwordProblem) return jsonError(passwordProblem, 400);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // The address is already taken — say so plainly. Registration is not a
    // password-reset path, so hiding this would only frustrate the user.
    await recordLoginAttempt(`register:${email}`, ipAddress, false);
    return jsonError("An account with that email already exists.", 409);
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name || null,
      passwordHash: await hashPassword(parsed.data.password),
      profile: { create: {} },
    },
  });

  await recordLoginAttempt(`register:${email}`, ipAddress, true);

  const { token, expiresAt } = await createSession(user.id, { userAgent, ipAddress });
  setSessionCookie(token, expiresAt, isSecureRequest(request));

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    origin: appOrigin(request),
  });
}
