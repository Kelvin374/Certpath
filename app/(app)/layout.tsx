import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { isAuthEnabled } from "@/lib/db";

/**
 * Authenticated app shell.
 *
 * The middleware gate only checks that a session cookie is *present*. This
 * layout validates it against the database, so a revoked or expired session
 * sends the learner back to the sign-in screen instead of leaving them on a
 * shell whose every request is about to fail.
 *
 * When no database is configured the platform runs account-free and the
 * layout lets everyone through.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (isAuthEnabled()) {
    const user = await getSessionUser();
    if (!user) redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
