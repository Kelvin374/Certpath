import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";

import { prisma, isAuthEnabled } from "./db";
import {
  DUMMY_PASSWORD_HASH,
  dummyPasswordCheck,
  hashPassword,
  hashToken,
  hasStrongSecret,
  isSameOrigin,
  isSecureRequest,
  validatePasswordStrength,
  verifyPassword,
} from "./auth-primitives";

export {
  DUMMY_PASSWORD_HASH,
  dummyPasswordCheck,
  hashPassword,
  hashToken,
  hasStrongSecret,
  isSameOrigin,
  isSecureRequest,
  validatePasswordStrength,
  verifyPassword,
};

export const SESSION_COOKIE = "certpath_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 24; // refresh within 24h of expiry
const SESSION_TOUCH_INTERVAL_MS = 1000 * 60 * 5; // at most one write every 5 min
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface SessionSummary {
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
  /** True when this is the session making the request. */
  current: boolean;
}

/* -------------------------------------------------------------------------
 * Tokens
 * ---------------------------------------------------------------------- */

/** Opaque, high-entropy token. Only its keyed hash is stored server-side. */
function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** Constant-time comparison of two hex digests. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/* -------------------------------------------------------------------------
 * Sessions
 * ---------------------------------------------------------------------- */

export interface RequestMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

/** Best-effort device and network information for the session list. */
export function getRequestMeta(request: Request): RequestMeta {
  const userAgent = request.headers.get("user-agent");
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  return {
    userAgent: userAgent ? userAgent.slice(0, 255) : null,
    ipAddress: ipAddress ? ipAddress.slice(0, 64) : null,
  };
}

/**
 * Start a new session.
 *
 * A user may hold several sessions at once — one per device. Signing in on a
 * phone must never sign the user out of their laptop.
 */
export async function createSession(
  userId: string,
  meta: RequestMeta = { userAgent: null, ipAddress: null },
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const session = await prisma.session.create({
    data: {
      userId,
      token: hash,
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    },
  });

  return { token, expiresAt, sessionId: session.id };
}

export async function destroySession(token: string): Promise<void> {
  try {
    await prisma.session.deleteMany({ where: { token: hashToken(token) } });
  } catch {
    // A missing session is not an error for a logout request.
  }
}

/** Every live session for a user, newest first. */
export async function listSessions(userId: string): Promise<SessionSummary[]> {
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { lastUsedAt: "desc" },
  });

  const currentToken = cookies().get(SESSION_COOKIE)?.value;
  const currentHash = currentToken ? hashToken(currentToken) : null;

  return sessions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    expiresAt: s.expiresAt,
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    current: currentHash !== null && safeEqual(s.token, currentHash),
  }));
}

/** Revoke one session, but only if it belongs to this user. */
export async function revokeSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
  return result.count > 0;
}

/**
 * Revoke every session for a user.
 *
 * `exceptToken` keeps the caller's own session alive — used when the password
 * changes and the other devices should be signed out but the current one
 * should stay signed in.
 */
export async function revokeAllSessions(
  userId: string,
  exceptToken?: string,
): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      userId,
      ...(exceptToken ? { token: { not: hashToken(exceptToken) } } : {}),
    },
  });
  return result.count;
}

/** Remove expired sessions. Called opportunistically. */
export async function pruneExpiredSessions(): Promise<void> {
  try {
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    // Housekeeping is best-effort.
  }
}

/**
 * Resolve the signed-in user from the request cookie, if any.
 *
 * The session is validated against the database on every call, so a revoked
 * or expired session stops working immediately rather than at cookie expiry.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isAuthEnabled()) return null;

  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const session = await prisma.session.findUnique({
      where: { token: hashToken(token) },
      include: { user: true },
    });
    if (!session) return null;

    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }

    void touchSession(session.id, session.lastUsedAt, session.expiresAt);

    return { id: session.user.id, email: session.user.email, name: session.user.name };
  } catch {
    return null;
  }
}

/**
 * Record activity on a session and roll its expiry forward.
 *
 * Writes are throttled so an active user does not produce a database write on
 * every single request.
 */
async function touchSession(
  sessionId: string,
  lastUsedAt: Date,
  expiresAt: Date,
): Promise<void> {
  const now = Date.now();
  const stale = now - lastUsedAt.getTime() > SESSION_TOUCH_INTERVAL_MS;
  if (!stale) return;

  const remaining = expiresAt.getTime() - now;
  const nextExpiry =
    remaining < SESSION_REFRESH_THRESHOLD_MS
      ? new Date(now + SESSION_TTL_MS)
      : expiresAt;

  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date(now), expiresAt: nextExpiry },
    });
  } catch {
    // A failed touch is not worth failing the request over.
  }
}

/* -------------------------------------------------------------------------
 * Password reset
 * ---------------------------------------------------------------------- */

/**
 * Issue a single-use password reset token.
 *
 * Returns the raw token — it is never stored, only its keyed hash is, so the
 * raw value can only be delivered once, at creation time.
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  // Invalidate any earlier unused tokens so only the newest one works.
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const { token, hash } = newToken();
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  return token;
}

export type ResetResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Look up a reset token without consuming it.
 *
 * The token is found first so the new password can be validated against the
 * account's email address, and only then consumed. Consuming up front would
 * burn the token whenever the password turned out to be too weak.
 */
export async function findPasswordResetToken(rawToken: string): Promise<{
  id: string;
  userId: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
} | null> {
  if (!rawToken) return null;

  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: { select: { email: true } } },
    });
    if (!record) return null;
    return {
      id: record.id,
      userId: record.userId,
      email: record.user.email,
      expiresAt: record.expiresAt,
      usedAt: record.usedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Mark a reset token as used.
 *
 * Returns false if the token was already consumed, which closes the window
 * where two requests race to redeem the same link.
 */
export async function consumePasswordResetToken(recordId: string): Promise<boolean> {
  try {
    const result = await prisma.passwordResetToken.updateMany({
      where: { id: recordId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count > 0;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------
 * Cookies
 * ---------------------------------------------------------------------- */

/**
 * Write the session cookie (route handlers only).
 *
 * `secure` must reflect the protocol the request actually arrived on, not
 * `NODE_ENV` — otherwise the cookie is silently dropped on any plain-HTTP
 * deployment (self-hosted, LAN, preview environment).
 */
export function setSessionCookie(token: string, expiresAt: Date, secure = false): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

/** Remove the session cookie (route handlers only). */
export function clearSessionCookie(secure = false): void {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}

/** Read the raw session token from the request cookie. */
export function readSessionToken(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value;
}
