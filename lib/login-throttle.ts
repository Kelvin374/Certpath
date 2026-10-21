import { prisma } from "./db";

/**
 * Login throttling.
 *
 * Failed sign-ins are recorded per account *and* per source address. Both
 * counters have to be respected: the account counter stops a focused attack
 * on one mailbox, and the address counter stops a spray across many
 * mailboxes from one host.
 *
 * The lockout length grows with the number of consecutive failures, so an
 * automated attacker hits a wall that keeps getting taller while a genuine
 * user who mistypes a password a few times waits only a short while.
 */

const MAX_IDENTIFIER_FAILURES = 5;
const MAX_IP_FAILURES = 50;
const WINDOW_MS = 15 * 60 * 1000;
const BASE_LOCKOUT_MS = 5 * 60 * 1000;
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000;
const MAX_IP_LOCKOUT_MS = 60 * 60 * 1000;
const RETENTION_MS = 48 * 60 * 60 * 1000;

export interface ThrottleDecision {
  allowed: boolean;
  /** Seconds until the lockout lifts. */
  retryAfterSeconds: number;
  reason?: "identifier" | "ip";
}

/**
 * Lockout length for a given failure count.
 *
 * It doubles with each additional failure past the threshold, so an automated
 * attacker hits a wall that keeps getting taller while a genuine user who
 * mistypes a password a few times waits only a short while.
 */
function lockoutLength(failures: number, threshold: number, max: number): number {
  const exponent = Math.max(0, failures - threshold);
  return Math.min(max, BASE_LOCKOUT_MS * Math.pow(2, exponent));
}

/**
 * Decide whether a sign-in attempt may proceed.
 *
 * Fails open: if the database is unreachable the attempt is allowed through,
 * because an outage should not lock every user out of their account.
 */
export async function checkLoginAllowed(
  identifier: string,
  ipAddress: string | null,
): Promise<ThrottleDecision> {
  try {
    await pruneOldAttempts();

    const now = Date.now();
    const windowStart = new Date(now - WINDOW_MS);

    const identifierFailures = await prisma.loginAttempt.count({
      where: { identifier, success: false, createdAt: { gte: windowStart } },
    });

    if (identifierFailures >= MAX_IDENTIFIER_FAILURES) {
      const oldest = await prisma.loginAttempt.findFirst({
        where: { identifier, success: false, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "asc" },
      });
      const until =
        (oldest?.createdAt.getTime() ?? now) +
        lockoutLength(identifierFailures, MAX_IDENTIFIER_FAILURES, MAX_LOCKOUT_MS);
      if (now < until) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
          reason: "identifier",
        };
      }
    }

    // The address counter is a volume guard, not a per-account one: many
    // legitimate users can share one address behind a corporate NAT, so the
    // threshold is high and the lockout is short.
    if (ipAddress) {
      const ipFailures = await prisma.loginAttempt.count({
        where: { ipAddress, success: false, createdAt: { gte: windowStart } },
      });

      if (ipFailures >= MAX_IP_FAILURES) {
        const oldest = await prisma.loginAttempt.findFirst({
          where: { ipAddress, success: false, createdAt: { gte: windowStart } },
          orderBy: { createdAt: "asc" },
        });
        const until =
          (oldest?.createdAt.getTime() ?? now) +
          lockoutLength(ipFailures, MAX_IP_FAILURES, MAX_IP_LOCKOUT_MS);
        if (now < until) {
          return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
            reason: "ip",
          };
        }
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    // Never let a throttling failure block a legitimate sign-in.
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Record the outcome of a sign-in attempt. */
export async function recordLoginAttempt(
  identifier: string,
  ipAddress: string | null,
  success: boolean,
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: { identifier, ipAddress, success },
    });
  } catch {
    // Recording is best-effort.
  }
}

/**
 * Forget the failed attempts for an account.
 *
 * Called after a successful sign-in so a user who fumbled their password a
 * few times does not stay throttled.
 */
export async function clearLoginFailures(identifier: string): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({ where: { identifier, success: false } });
  } catch {
    // Best-effort.
  }
}

/** Delete attempts that are outside the retention window. */
export async function pruneOldAttempts(): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  } catch {
    // Best-effort housekeeping.
  }
}
