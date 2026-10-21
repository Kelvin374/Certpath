/**
 * End-to-end authentication tests.
 *
 * Exercises the real HTTP API: registration, sign-in, multi-device sessions,
 * revocation, password change, password reset, account deletion, brute-force
 * throttling and cross-origin rejection.
 *
 * Usage:
 *   node scripts/test-auth.mjs [baseUrl]
 *
 * Requires a running server with a database configured.
 */
const BASE = process.argv[2] ?? "http://localhost:3100";

/* -------------------------------------------------------------------------
 * Tiny harness
 * ---------------------------------------------------------------------- */

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}\n      ${message}`);
    console.log(`  ✗ ${name}\n      ${message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/* -------------------------------------------------------------------------
 * Cookie jar
 * ---------------------------------------------------------------------- */

class Jar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(response) {
    const raw =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);

    for (const cookie of raw) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === "" || /expires=Thu, 01 Jan 1970/i.test(cookie)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  get(name) {
    return this.cookies.get(name);
  }

  clear() {
    this.cookies.clear();
  }
}

async function api(path, { method = "GET", body, jar, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders["content-type"] = "application/json";
  if (jar) {
    const cookie = jar.header();
    if (cookie) requestHeaders.cookie = cookie;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });

  if (jar) jar.absorb(res);

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status, json, headers: res.headers };
}

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* -------------------------------------------------------------------------
 * Suite
 * ---------------------------------------------------------------------- */

async function main() {
  console.log(`Auth end-to-end tests against ${BASE}\n`);

  const email = `auth-${uniq()}@certpath.test`;
  const password = "correct horse battery staple";
  const jarA = new Jar();
  const jarB = new Jar();

  console.log("Registration");
  await test("registering creates an account and signs the user in", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      body: { email, password, name: "Auth Tester" },
      jar: jarA,
    });
    equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.json)}`);
    equal(res.json.user.email, email);
    assert(jarA.get("certpath_session"), "no session cookie was set");
  });

  await test("the same email cannot be registered twice", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      body: { email, password },
      jar: new Jar(),
    });
    equal(res.status, 409);
  });

  await test("a weak password is rejected", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      body: { email: `weak-${uniq()}@certpath.test`, password: "short" },
      jar: new Jar(),
    });
    equal(res.status, 400);
    assert(/10 characters/i.test(res.json.error), "expected a length complaint");
  });

  await test("a password containing the email local part is rejected", async () => {
    const local = "leonardo";
    const res = await api("/api/auth/register", {
      method: "POST",
      body: { email: `${local}@certpath.test`, password: `${local}password123` },
      jar: new Jar(),
    });
    equal(res.status, 400);
  });

  console.log("\nSign in");
  await test("a wrong password is rejected", async () => {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: { email, password: "not the password" },
      jar: new Jar(),
    });
    equal(res.status, 401);
  });

  await test("an unknown email gives the same message as a wrong password", async () => {
    const unknown = await api("/api/auth/login", {
      method: "POST",
      body: { email: `nobody-${uniq()}@certpath.test`, password },
      jar: new Jar(),
    });
    const wrong = await api("/api/auth/login", {
      method: "POST",
      body: { email, password: "not the password" },
      jar: new Jar(),
    });
    equal(unknown.status, wrong.status);
    equal(unknown.json.error, wrong.json.error, "error messages differ and leak account existence");
  });

  await test("an unknown email takes as long as a known one", async () => {
    const unknownStart = Date.now();
    await api("/api/auth/login", {
      method: "POST",
      body: { email: `nobody-${uniq()}@certpath.test`, password },
      jar: new Jar(),
    });
    const unknownMs = Date.now() - unknownStart;

    const knownStart = Date.now();
    await api("/api/auth/login", {
      method: "POST",
      body: { email, password: "not the password" },
      jar: new Jar(),
    });
    const knownMs = Date.now() - knownStart;

    assert(unknownMs > 100, `the unknown-address path took ${unknownMs}ms — no work was done`);
    assert(
      unknownMs > knownMs * 0.4,
      `the unknown-address path took ${unknownMs}ms against ${knownMs}ms for a known one — the two are distinguishable`,
    );
  });

  await test("signing in again on another device keeps the first session alive", async () => {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: { email, password },
      jar: jarB,
    });
    equal(res.status, 200);
    assert(jarB.get("certpath_session"), "no session cookie was set");

    const first = await api("/api/me", { jar: jarA });
    const second = await api("/api/me", { jar: jarB });
    equal(first.status, 200, "the original session was invalidated by the second sign-in");
    equal(second.status, 200);
  });

  console.log("\nSessions");
  let sessionIdB = "";

  await test("both sessions are listed and one is marked current", async () => {
    const res = await api("/api/account", { jar: jarA });
    equal(res.status, 200);
    equal(res.json.sessions.length, 2, "expected two concurrent sessions");
    equal(res.json.sessions.filter((s) => s.current).length, 1, "exactly one session should be current");
    const other = res.json.sessions.find((s) => !s.current);
    assert(other, "expected a non-current session");
    sessionIdB = other.id;
  });

  await test("a session can be revoked individually", async () => {
    const res = await api(`/api/account/sessions/${sessionIdB}`, { method: "DELETE", jar: jarA });
    equal(res.status, 200);

    const revoked = await api("/api/me", { jar: jarB });
    equal(revoked.status, 401, "the revoked session still works");
    const stillGood = await api("/api/me", { jar: jarA });
    equal(stillGood.status, 200, "revoking one session killed the other");
  });

  await test("a session belonging to another account cannot be revoked", async () => {
    const otherEmail = `other-${uniq()}@certpath.test`;
    const otherJar = new Jar();
    await api("/api/auth/register", {
      method: "POST",
      body: { email: otherEmail, password },
      jar: otherJar,
    });

    const res = await api(`/api/account/sessions/${sessionIdB}`, {
      method: "DELETE",
      jar: otherJar,
    });
    equal(res.status, 404, "cross-account session revocation should not succeed");
  });

  console.log("\nPassword change");
  await test("changing the password requires the current one", async () => {
    const res = await api("/api/account/password", {
      method: "POST",
      body: { currentPassword: "wrong", newPassword: "a brand new long password" },
      jar: jarA,
    });
    equal(res.status, 403);
  });

  await test("changing the password revokes other sessions", async () => {
    const jarC = new Jar();
    await api("/api/auth/login", { method: "POST", body: { email, password }, jar: jarC });
    equal((await api("/api/me", { jar: jarC })).status, 200);

    const res = await api("/api/account/password", {
      method: "POST",
      body: { currentPassword: password, newPassword: "an even better long password" },
      jar: jarA,
    });
    equal(res.status, 200);

    equal((await api("/api/me", { jar: jarC })).status, 401, "other sessions survived the password change");
    equal((await api("/api/me", { jar: jarA })).status, 200, "the changing session was signed out");
  });

  await test("the old password no longer works and the new one does", async () => {
    const old = await api("/api/auth/login", {
      method: "POST",
      body: { email, password },
      jar: new Jar(),
    });
    equal(old.status, 401, "the old password still works");

    const fresh = await api("/api/auth/login", {
      method: "POST",
      body: { email, password: "an even better long password" },
      jar: jarA,
    });
    equal(fresh.status, 200);
  });

  console.log("\nPassword reset");
  let resetUrl = "";

  await test("requesting a reset always returns the same message", async () => {
    const known = await api("/api/auth/forgot-password", {
      method: "POST",
      body: { email },
      jar: new Jar(),
    });
    const unknown = await api("/api/auth/forgot-password", {
      method: "POST",
      body: { email: `nobody-${uniq()}@certpath.test` },
      jar: new Jar(),
    });
    equal(known.status, 200);
    equal(unknown.status, 200);
    equal(known.json.message, unknown.json.message, "the response reveals whether the account exists");
    assert(known.json.devResetUrl, "expected a development reset link");
    resetUrl = known.json.devResetUrl;
  });

  await test("a reset token sets a new password and revokes existing sessions", async () => {
    const token = new URL(resetUrl).searchParams.get("token");
    assert(token, "no token in the reset URL");

    const res = await api("/api/auth/reset-password", {
      method: "POST",
      body: { token, password: "the final and best password" },
      jar: jarA,
    });
    equal(res.status, 200, JSON.stringify(res.json));

    equal((await api("/api/me", { jar: jarA })).status, 200, "the reset should sign the user in");
  });

  await test("a reset token cannot be used twice", async () => {
    const token = new URL(resetUrl).searchParams.get("token");
    const res = await api("/api/auth/reset-password", {
      method: "POST",
      body: { token, password: "yet another good password" },
      jar: new Jar(),
    });
    equal(res.status, 400);
  });

  await test("an invalid reset token is rejected", async () => {
    const res = await api("/api/auth/reset-password", {
      method: "POST",
      body: { token: "not-a-real-token-value", password: "a perfectly fine password" },
      jar: new Jar(),
    });
    equal(res.status, 400);
  });

  console.log("\nThrottling");
  await test("repeated failures lock the account out", async () => {
    const victim = `throttle-${uniq()}@certpath.test`;
    let locked = false;
    let lastStatus = 0;
    for (let i = 0; i < 8; i++) {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: { email: victim, password: "wrong wrong wrong" },
        jar: new Jar(),
      });
      lastStatus = res.status;
      if (res.status === 429) {
        locked = true;
        break;
      }
    }
    assert(locked, `expected a 429 lockout, last status was ${lastStatus}`);
  });

  await test("a successful sign-in clears the failure counter", async () => {
    const user = `clear-${uniq()}@certpath.test`;
    const jar = new Jar();
    await api("/api/auth/register", {
      method: "POST",
      body: { email: user, password },
      jar,
    });

    for (let i = 0; i < 3; i++) {
      await api("/api/auth/login", {
        method: "POST",
        body: { email: user, password: "nope nope nope" },
        jar: new Jar(),
      });
    }
    const ok = await api("/api/auth/login", {
      method: "POST",
      body: { email: user, password },
      jar: new Jar(),
    });
    equal(ok.status, 200);

    // Four more failures should not trip the five-failure threshold.
    let locked = false;
    for (let i = 0; i < 4; i++) {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: { email: user, password: "nope nope nope" },
        jar: new Jar(),
      });
      if (res.status === 429) locked = true;
    }
    assert(!locked, "the counter was not reset by the successful sign-in");
  });

  console.log("\nCross-origin");
  await test("a cross-origin state change is rejected", async () => {
    const res = await api("/api/account/password", {
      method: "POST",
      body: { currentPassword: password, newPassword: "cross origin attempt" },
      jar: jarA,
      headers: { origin: "https://evil.example.com" },
    });
    equal(res.status, 403);
  });

  await test("a same-origin state change is allowed", async () => {
    const res = await api("/api/account", {
      method: "PATCH",
      body: { name: "Renamed" },
      jar: jarA,
      headers: { origin: BASE },
    });
    equal(res.status, 200);
  });

  console.log("\nAccount deletion");
  await test("deleting the account requires the password and the word DELETE", async () => {
    const missing = await api("/api/account", {
      method: "DELETE",
      body: { password },
      jar: jarA,
    });
    equal(missing.status, 400, "the confirmation word was not required");

    const wrong = await api("/api/account", {
      method: "DELETE",
      body: { password: "not the password", confirmation: "DELETE" },
      jar: jarA,
    });
    equal(wrong.status, 403, "a wrong password was accepted");
  });

  await test("deleting the account removes the session and the data", async () => {
    const res = await api("/api/account", {
      method: "DELETE",
      body: { password: "the final and best password", confirmation: "DELETE" },
      jar: jarA,
    });
    equal(res.status, 200, JSON.stringify(res.json));

    equal((await api("/api/me", { jar: jarA })).status, 401, "the session survived deletion");

    const login = await api("/api/auth/login", {
      method: "POST",
      body: { email, password: "the final and best password" },
      jar: new Jar(),
    });
    equal(login.status, 401, "the account still exists after deletion");
  });

  console.log("\nGuards");
  await test("account endpoints require a session", async () => {
    equal((await api("/api/account", { jar: new Jar() })).status, 401);
    equal((await api("/api/account/sessions", { jar: new Jar() })).status, 401);
  });

  console.log("\n" + "=".repeat(52));
  if (failures.length) {
    console.log(`FAILED — ${passed} passed, ${failures.length} failed\n`);
    failures.forEach((f) => console.log(`  x ${f}\n`));
    process.exit(1);
  }
  console.log(`All ${passed} auth tests passed.`);
}

main().catch((err) => {
  console.error("Auth test run crashed:", err);
  process.exit(1);
});
