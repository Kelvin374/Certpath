import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Authentication primitives with no framework dependency.
 *
 * Everything here is pure — no cookies, no database, no Next.js imports — so
 * it can be unit-tested directly and reused from any runtime.
 */

/* -------------------------------------------------------------------------
 * Passwords
 * ---------------------------------------------------------------------- */

export const BCRYPT_ROUNDS = 12;

/**
 * A bcrypt comparison faster than this means the hash was rejected without
 * any work being done.
 */
export const MIN_COMPARISON_MS = 50;

/**
 * A valid bcrypt hash of a random value that was discarded when this file
 * was written.
 *
 * Comparing against it when an email is unknown keeps the login response time
 * constant, so the endpoint cannot be used to enumerate registered addresses.
 * The hash must be exactly 60 characters — bcrypt silently rejects a
 * malformed hash and returns instantly, which would defeat the whole point,
 * so `dummyPasswordCheck` also guards against that below.
 */
export const DUMMY_PASSWORD_HASH =
  "$2a$12$ufVIWq1.CP04bz0IoRwGueBSP3yW9TekjjwtqDzJ8J8MWSrV5cq16";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Burn roughly the same time as a real password check.
 *
 * Called when the email is unknown so that a failed lookup and a failed
 * password take indistinguishable time. If bcrypt rejects the comparison
 * outright it returns in microseconds — visibly faster than a real check and
 * therefore a leak — so the elapsed time is measured and a real hash is
 * computed when the comparison came back too quickly.
 */
export async function dummyPasswordCheck(password: string): Promise<void> {
  const started = Date.now();
  try {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
  } catch {
    // Ignored — the timing guard below is what matters.
  }
  if (Date.now() - started < MIN_COMPARISON_MS) {
    await bcrypt.hash(password, BCRYPT_ROUNDS).catch(() => undefined);
  }
}

/* -------------------------------------------------------------------------
 * Secret
 * ---------------------------------------------------------------------- */

/**
 * Key used to derive token hashes.
 *
 * Tokens are stored as a keyed HMAC rather than a plain SHA-256 so that a
 * database leak on its own cannot be used to verify a guessed session or
 * password-reset token.
 */
export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  return "certpath-development-secret-do-not-use-in-production";
}

/** True when the deployment is running with a real secret. */
export function hasStrongSecret(): boolean {
  const secret = process.env.AUTH_SECRET;
  return Boolean(secret && secret.length >= 16);
}

/* -------------------------------------------------------------------------
 * Tokens
 * ---------------------------------------------------------------------- */

/** Keyed hash of a session or reset token. */
export function hashToken(token: string): string {
  return createHmac("sha256", authSecret()).update(token).digest("hex");
}

/* -------------------------------------------------------------------------
 * Password policy
 * ---------------------------------------------------------------------- */

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "123456789", "1234567890",
  "qwertyuiop", "letmein123", "iloveyou1", "admin12345", "welcome123",
  "certpath123", "studypractice", "abc123456", "passw0rd123",
]);

/**
 * Password policy.
 *
 * Returns a human-readable problem, or `null` when the password is accepted.
 * Deliberately length-first: length is what actually resists guessing, so a
 * long passphrase passes even without symbol/case gymnastics.
 */
export function validatePasswordStrength(password: string, email?: string | null): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "That password is too common.";
  if (/^(.)\1+$/.test(password)) return "Your password must not be one repeated character.";
  if (email) {
    const local = email.split("@")[0]?.toLowerCase() ?? "";
    if (local.length >= 3 && password.toLowerCase().includes(local)) {
      return "Your password must not contain your email address.";
    }
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Request helpers
 * ---------------------------------------------------------------------- */

/**
 * Whether the incoming request was served over HTTPS.
 *
 * `x-forwarded-proto` is checked first so reverse proxies (nginx, Caddy,
 * a platform load balancer) report the original protocol correctly.
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Whether a state-changing request came from this site.
 *
 * `SameSite=Lax` already blocks the classic cross-site form POST, so this is
 * defence in depth for the JSON endpoints. A request with no `Origin` header
 * is not from a browser and is allowed through.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let requestOrigin: string;
  try {
    const url = new URL(request.url);
    requestOrigin = url.origin;

    // Behind a proxy the request URL may be http while the browser used
    // https — honour the forwarded headers when they are present.
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost) {
      const proto =
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
        url.protocol.replace(":", "");
      requestOrigin = `${proto}://${forwardedHost}`;
    }
  } catch {
    return false;
  }

  return origin === requestOrigin;
}
