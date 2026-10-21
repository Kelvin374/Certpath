import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js dev-mode hot reloading would otherwise open a new pool on every
 * edit, so the instance is cached on `globalThis` outside production.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Accounts are enabled whenever a database is configured. Without one the
 * app still runs, but as a single-device guest experience with no sign-in.
 */
export function isAuthEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Probe the database once. Used by the landing page and the sync endpoint to
 * degrade gracefully when the database is unreachable rather than 500ing.
 */
let availability: { ok: boolean; checkedAt: number } | null = null;

export async function checkDatabase(): Promise<boolean> {
  if (!isAuthEnabled()) return false;
  if (availability && Date.now() - availability.checkedAt < 15_000) return availability.ok;
  try {
    await prisma.$queryRaw`SELECT 1`;
    availability = { ok: true, checkedAt: Date.now() };
  } catch {
    availability = { ok: false, checkedAt: Date.now() };
  }
  return availability.ok;
}
