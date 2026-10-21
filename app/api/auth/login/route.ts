import { NextResponse } from "next/server";
import { z } from "zod";

import { appOrigin, guardOrigin, jsonError, throttleResponse } from "@/lib/api-helpers";
import {
  createSession,
  dummyPasswordCheck,
  getRequestMeta,
  isSecureRequest,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { isAuthEnabled, prisma } from "@/lib/db";
import { checkLoginAllowed, clearLoginFailures, recordLoginAttempt } from "@/lib/login-throttle";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
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
    return jsonError("Enter your email and password.", 400);
  }

  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;
  const { userAgent, ipAddress } = getRequestMeta(request);

  const throttle = await checkLoginAllowed(email, ipAddress);
  if (!throttle.allowed) {
    return throttleResponse(throttle);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Spend the same time as a real check so the response time does not
    // reveal whether the address is registered.
    await dummyPasswordCheck(password);
    await recordLoginAttempt(email, ipAddress, false);
    return jsonError("Email or password is incorrect.", 401);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await recordLoginAttempt(email, ipAddress, false);
    return jsonError("Email or password is incorrect.", 401);
  }

  await clearLoginFailures(email);
  await recordLoginAttempt(email, ipAddress, true);

  // A new session row per sign-in — signing in on another device leaves the
  // existing one alone.
  const { token, expiresAt } = await createSession(user.id, { userAgent, ipAddress });
  setSessionCookie(token, expiresAt, isSecureRequest(request));

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    origin: appOrigin(request),
  });
}
