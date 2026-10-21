import { NextResponse } from "next/server";

import { getSessionUser, isSameOrigin, type SessionUser } from "./auth";
import type { ThrottleDecision } from "./login-throttle";

/* -------------------------------------------------------------------------
 * Responses
 * ---------------------------------------------------------------------- */

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/* -------------------------------------------------------------------------
 * Guards
 * ---------------------------------------------------------------------- */

/** The signed-in user, or `null`. */
export async function currentUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

/**
 * Reject a state-changing request that did not come from this site.
 *
 * `SameSite=Lax` already covers the classic cross-site form post; this is the
 * second lock on the JSON endpoints.
 */
export function guardOrigin(request: Request): NextResponse | null {
  if (isSameOrigin(request)) return null;
  return jsonError("Cross-origin request rejected.", 403);
}

/** Reject the request unless a valid session is present. */
export async function requireUser(): Promise<
  { user: SessionUser } | { response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Not signed in.", 401) };
  return { user };
}

/* -------------------------------------------------------------------------
 * Throttling
 * ---------------------------------------------------------------------- */

/** Turn a throttle decision into the standard 429 response. */
export function throttleResponse(decision: ThrottleDecision): NextResponse {
  const minutes = Math.max(1, Math.ceil(decision.retryAfterSeconds / 60));
  return NextResponse.json(
    {
      error: `Too many failed sign-in attempts. Try again in ${minutes} minute${
        minutes === 1 ? "" : "s"
      }.`,
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "retry-after": String(decision.retryAfterSeconds) },
    },
  );
}

/* -------------------------------------------------------------------------
 * Origin
 * ---------------------------------------------------------------------- */

/**
 * Whether a hostname refers to the machine itself or a private network.
 *
 * Used to tell "the request arrived from inside the deployment" apart from
 * "the request arrived from the public internet".
 */
function isInternalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") {
    return true;
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

/**
 * The public origin of this deployment.
 *
 * Used to build links that appear in emails, which have to point at wherever
 * the learner actually is — not at an internal hostname.
 *
 * The request's own origin is the best answer and is used by default, so a
 * development server on a non-standard port produces working links. A
 * forwarded host takes precedence, because a reverse proxy knows the public
 * hostname better than the application does. `NEXT_PUBLIC_APP_URL` is the last
 * resort, used only when the request clearly came from inside the deployment
 * and no forwarded host was supplied.
 */
export function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");

  try {
    const url = new URL(request.url);

    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost) {
      const proto =
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
        url.protocol.replace(":", "");
      return `${proto}://${forwardedHost}`;
    }

    if (configured) {
      try {
        const configuredUrl = new URL(configured);
        if (
          isInternalHostname(url.hostname) &&
          !isInternalHostname(configuredUrl.hostname)
        ) {
          return configured;
        }
      } catch {
        // An unparseable configured value is ignored.
      }
    }

    return url.origin;
  } catch {
    return configured || "http://localhost:3000";
  }
}
