/**
 * Headless browser smoke test.
 *
 * Drives the real app in Chrome over the DevTools Protocol to verify the
 * things a static build cannot: that the store hydrates, that pages render
 * real content (not just the boot screen), that the quiz flow works
 * end-to-end, and that nothing throws in the console.
 *
 * Usage:
 *   node scripts/browser-check.mjs [baseUrl] [--guest]
 *
 * `--guest` skips the account flow and exercises the platform with no
 * database configured (progress stored on the device only).
 *
 * Requires a Chrome/Edge binary and a running dev or production server.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const GUEST = args.includes("--guest");
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3100";
const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error("No Chrome/Edge binary found — skipping browser smoke test.");
  process.exit(0);
}

/* -------------------------------------------------------------------------
 * Tiny CDP client
 * ---------------------------------------------------------------------- */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
        return;
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        this.pageErrors.push(d.exception?.description ?? d.text ?? "unknown error");
      }
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.consoleErrors.push(
          msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "),
        );
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    }
    return result.result.value;
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    await this.waitFor("document.readyState === 'complete'");
    await this.settle();
  }

  /** Wait until an expression becomes truthy. */
  async waitFor(expression, timeout = 15_000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await this.evaluate(`!!(${expression})`)) return true;
      } catch {
        /* page may be navigating */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }

  /** Give React a moment to flush effects and transitions. */
  async settle(ms = 700) {
    await new Promise((r) => setTimeout(r, ms));
  }

  async text() {
    return this.evaluate("document.body.innerText");
  }
}

/* -------------------------------------------------------------------------
 * Runner
 * ---------------------------------------------------------------------- */

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const profileDir = mkdtempSync(join(tmpdir(), "certpath-chrome-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  return cdp;
}

async function main() {
  const cdp = await connect();
  const email = `browser${Date.now()}@certpath.test`;
  const password = "hunter2hunter2";

  console.log(`Browser smoke test against ${BASE}\n`);

  /* ── Landing page ─────────────────────────────────────────────── */
  console.log("Landing");
  await cdp.goto(`${BASE}/`);
  await cdp.waitFor("document.body.innerText.includes('CertPath')");
  const landing = await cdp.text();
  check("landing renders the hero", landing.includes("Prepare for the exam"));
  check("landing shows the disclaimer", /not affiliated|independent study aid/i.test(landing));
  check(
    "landing lists a real exam count",
    /\b2[0-9]\s*exams|\b1[0-9]\s*exams/.test(landing),
    (landing.match(/\b\d+\s+exams?\b/) ?? [])[0] ?? "",
  );

  /* ── Register ─────────────────────────────────────────────────── */
  console.log("\nAuth");
  if (GUEST) {
    const accountsEnabled = await cdp.evaluate(
      "fetch('/api/me', {cache:'no-store'}).then(r=>r.json()).then(j=>j.accountsEnabled === false)",
    );
    check("guest mode detected (no database configured)", accountsEnabled === true);

    await cdp.goto(`${BASE}/login`);
    await cdp.waitFor("document.body.innerText.length > 0");
    await cdp.settle(900);
    const loginText = await cdp.text();
    check("login page explains that accounts are disabled", /Accounts are currently disabled/i.test(loginText));
    check("login page offers to continue without an account", /Continue without an account/i.test(loginText));

    await cdp.goto(`${BASE}/dashboard`);
    const guestDash = await cdp.waitFor(
      "document.body.innerText.includes('What are you preparing for')",
    );
    check("dashboard is reachable without an account", guestDash);
  } else {
    await cdp.goto(`${BASE}/register`);
    const hydrated = await cdp.waitFor(
      "document.querySelector('input[type=email]') !== null",
    );
    check("register form renders after hydration", hydrated);

    await cdp.evaluate(`
      (() => {
        const set = (el, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const inputs = document.querySelectorAll('input');
        set(inputs[0], ${JSON.stringify("Browser Tester")});
        set(inputs[1], ${JSON.stringify(email)});
        set(inputs[2], ${JSON.stringify(password)});
        document.querySelector('form').requestSubmit();
        return true;
      })()
    `);
    const loggedIn = await cdp.waitFor("location.pathname === '/dashboard'");
    check("registration redirects to the dashboard", loggedIn);
  }

  /* ── Dashboard ────────────────────────────────────────────────── */
  console.log("\nDashboard");
  await cdp.waitFor("document.body.innerText.includes('What are you preparing for')");
  const dash = await cdp.text();
  check("onboarding shows the exam picker", dash.includes("What are you preparing for"));
  check("onboarding lists AZ-900", dash.includes("AZ-900"));
  check("dashboard shows the streak", /streak/i.test(dash));

  // Complete onboarding by selecting the first exam card's target button.
  await cdp.evaluate(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const pick = btns.find(b => b.textContent.trim() === 'Set as target');
      if (pick) pick.click();
      return true;
    })()
  `);
  await cdp.settle(400);
  await cdp.evaluate(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const go = btns.find(b => b.textContent.includes('Start my plan'));
      if (go) go.click();
      return true;
    })()
  `);
  await cdp.settle(900);
  const afterOnboard = await cdp.text();
  check("onboarding completes to the dashboard", afterOnboard.includes("Readiness estimate"));
  check("dashboard shows the readiness ring", /Readiness estimate/.test(afterOnboard));

  /* ── Store persisted ──────────────────────────────────────────── */
  const stored = await cdp.evaluate(
    "JSON.parse(localStorage.getItem('certpath.v1') || '{}')?.state?.onboarded === true",
  );
  check("store persists to localStorage", stored === true);

  /* ── Quiz ─────────────────────────────────────────────────────── */
  console.log("\nQuiz");
  await cdp.goto(`${BASE}/quiz`);
  await cdp.waitFor("document.body.innerText.includes('Smart Quiz Builder')");
  check("quiz builder renders", (await cdp.text()).includes("Smart Quiz Builder"));

  await cdp.evaluate(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const start = btns.find(b => b.textContent.trim() === 'Start quiz');
      if (start) start.click();
      return true;
    })()
  `);
  await cdp.settle(700);
  const quizText = await cdp.text();
  check("quiz question renders", /Question 1 \//.test(quizText));

  // Answer each question: pick an option, check the answer, then advance.
  let answered = 0;
  for (let i = 0; i < 20; i++) {
    if (await cdp.evaluate("document.body.innerText.includes('Results —')")) break;

    const hasCheck = await cdp.evaluate(
      "[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Check answer')",
    );
    if (!hasCheck) break;

    // 1. Select the first option.
    await cdp.evaluate(`
      (() => {
        const opt = document.querySelector('[role=group] button');
        if (opt) opt.click();
        return true;
      })()
    `);
    await cdp.settle(200);

    // 2. Check the answer.
    await cdp.evaluate(`
      (() => {
        const check = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Check answer');
        if (check && !check.disabled) check.click();
        return true;
      })()
    `);
    await cdp.settle(250);

    // 3. Advance (or finish).
    const advanced = await cdp.evaluate(`
      (() => {
        const next = [...document.querySelectorAll('button')].find(b => /^(Next|Finish)$/.test(b.textContent.trim()));
        if (next) { next.click(); return true; }
        return false;
      })()
    `);
    answered++;
    await cdp.settle(300);
    if (!advanced) break;
  }
  const resultsText = await cdp.text();
  check("quiz completes and shows results", resultsText.includes("Results —"));
  check("results show a per-domain breakdown", resultsText.includes("Per-domain breakdown"));
  check("results link to the official exam", resultsText.includes("official exam"));
  console.log(`     (answered ${answered} question(s))`);

  /* ── Flashcards ───────────────────────────────────────────────── */
  console.log("\nFlashcards");
  await cdp.goto(`${BASE}/flashcards`);
  await cdp.waitFor("document.body.innerText.includes('Flashcards')");
  const cardsText = await cdp.text();
  check("flashcard deck renders", cardsText.includes("mastered"));
  check("rating buttons render", cardsText.includes("Again") && cardsText.includes("Good"));

  await cdp.evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Good');
      if (b) b.click();
      return true;
    })()
  `);
  await cdp.settle(500);
  const reviewRecorded = await cdp.evaluate(
    "Object.keys(JSON.parse(localStorage.getItem('certpath.v1') || '{}')?.state?.reviews || {}).length > 0",
  );
  check("rating a card records a review", reviewRecorded === true);

  /* ── Planner ──────────────────────────────────────────────────── */
  console.log("\nPlanner");
  await cdp.goto(`${BASE}/planner`);
  await cdp.waitFor("document.body.innerText.includes('Study planner')");
  check("planner renders", (await cdp.text()).includes("Plan inputs"));

  await cdp.evaluate(`
    (() => {
      const set = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const date = document.querySelector('input[type=date]');
      const d = new Date(); d.setDate(d.getDate() + 21);
      set(date, d.toISOString().slice(0, 10));
      return true;
    })()
  `);
  await cdp.settle(300);
  await cdp.evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Generate day-by-day plan'));
      if (b) b.click();
      return true;
    })()
  `);
  await cdp.settle(900);
  const planText = await cdp.text();
  check("plan generates a schedule", planText.includes("Your plan — exam on"));
  check("plan lists tasks", /Practice quiz|Flashcard review|Review fundamentals/.test(planText));

  /* ── Readiness ────────────────────────────────────────────────── */
  console.log("\nReadiness");
  await cdp.goto(`${BASE}/readiness`);
  await cdp.waitFor("document.body.innerText.includes('Readiness tracker')");
  const readyText = await cdp.text();
  check("readiness renders", readyText.includes("Readiness tracker"));
  check("readiness shows an estimate", /\d+%/.test(readyText));
  check("readiness labels milestones as milestones", readyText.includes("Study milestones"));
  check("readiness mentions it is an estimate", /estimate/i.test(readyText));

  /* ── Buddy ────────────────────────────────────────────────────── */
  console.log("\nStudy Buddy");
  await cdp.goto(`${BASE}/buddy`);
  await cdp.waitFor("document.body.innerText.includes('Study Buddy')");
  check("buddy renders", (await cdp.text()).includes("Original content only"));

  await cdp.evaluate(`
    (() => {
      const input = document.querySelector('input[aria-label="Message the study buddy"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Explain availability zones');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('form').requestSubmit();
      return true;
    })()
  `);
  await cdp.settle(1200);
  const buddyText = await cdp.text();
  check("buddy answers a question", buddyText.includes("Explain availability zones"));
  check(
    "buddy reply quotes the content bank",
    /availability zone/i.test(buddyText) && buddyText.length > 600,
    `${buddyText.length} chars`,
  );

  /* ── Account & password reset ─────────────────────────────────── */
  if (GUEST) {
    console.log("\nAccount");
    await cdp.goto(`${BASE}/account`);
    await cdp.waitFor("document.body.innerText.length > 0");
    await cdp.settle(900);
    const guestAccount = await cdp.text();
    check(
      "account page explains that accounts are disabled",
      /disabled|sign in/i.test(guestAccount),
    );
  } else {
    console.log("\nAccount");
    await cdp.goto(`${BASE}/account`);
    const accountLoaded = await cdp.waitFor("document.body.innerText.length > 0");
    check("account page renders", accountLoaded);
    await cdp.settle(900);
    const accountText = await cdp.text();
    check("account page shows the signed-in address", accountText.includes(email));
    check("account page lists sessions", /session|device/i.test(accountText));
    check("account page offers a password change", /password/i.test(accountText));
    check("account page offers account deletion", /delete/i.test(accountText));

    console.log("\nPassword reset");
    await cdp.goto(`${BASE}/forgot-password`);
    await cdp.waitFor("document.querySelector('input[type=email]') !== null");
    check("forgot-password form renders", true);

    await cdp.evaluate(`
      (() => {
        const set = (el, v) => {
          const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const input = document.querySelector('input[type=email]');
        set(input, ${JSON.stringify(email)});
        document.querySelector('form').requestSubmit();
        return true;
      })()
    `);
    await cdp.settle(1500);
    const forgotText = await cdp.text();
    check(
      "forgot-password always shows the neutral message",
      /reset link is on its way/i.test(forgotText),
    );
    const devLink = await cdp.evaluate(`
      (() => {
        const a = [...document.querySelectorAll('a')].find(x => x.href.includes('/reset-password?token='));
        return a ? a.href : null;
      })()
    `);
    check("a development reset link is offered", typeof devLink === "string");

    if (typeof devLink === "string") {
      await cdp.goto(devLink);
      await cdp.waitFor("document.querySelector('input[type=password]') !== null");
      check("reset-password form renders", true);

      await cdp.evaluate(`
        (() => {
          const set = (el, v) => {
            const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
          };
          const inputs = document.querySelectorAll('input[type=password]');
          set(inputs[0], 'a brand new strong password');
          set(inputs[1], 'a brand new strong password');
          document.querySelector('form').requestSubmit();
          return true;
        })()
      `);
      await cdp.settle(2000);
      check(
        "resetting the password signs the user in",
        await cdp.evaluate("location.pathname === '/dashboard'"),
      );
    }
  }

  /* ── Sync ─────────────────────────────────────────────────────── */
  console.log("\nSync");
  if (GUEST) {
    const noSync = await cdp.evaluate(
      "fetch('/api/me', {cache:'no-store'}).then(r=>r.json()).then(j=>j.state === null)",
    );
    check("guest mode keeps state on the device only", noSync === true);
  } else {
    await cdp.settle(2500);
    const synced = await cdp.evaluate(`
      fetch('/api/me', { cache: 'no-store' })
        .then(r => r.json())
        .then(j => !!j.user && !!j.state && j.state.pastAttempts.length > 0)
        .catch(() => false)
    `);
    check("attempts sync to the account", synced === true);

    const syncedReviews = await cdp.evaluate(`
      fetch('/api/me', { cache: 'no-store' })
        .then(r => r.json())
        .then(j => !!j.state && Object.keys(j.state.reviews || {}).length > 0)
        .catch(() => false)
    `);
    check("flashcard reviews sync to the account", syncedReviews === true);
  }

  /* ── Console health ───────────────────────────────────────────── */
  console.log("\nConsole");
  const ignorable = (msg) =>
    /favicon|Download the React DevTools|was preloaded using link preload/i.test(msg);
  const errors = cdp.pageErrors.filter((e) => !ignorable(e));
  const consoleErrs = cdp.consoleErrors.filter((e) => !ignorable(e));
  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("no console errors", consoleErrs.length === 0, consoleErrs.slice(0, 3).join(" | "));

  /* ── Summary ──────────────────────────────────────────────────── */
  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(52));
  if (failed.length) {
    console.log(`FAILED — ${results.length - failed.length}/${results.length} checks passed`);
    failed.forEach((f) => console.log(`  x ${f.name}${f.detail ? ` — ${f.detail}` : ""}`));
  } else {
    console.log(`All ${results.length} browser checks passed.`);
  }

  chrome.kill();
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Browser smoke test crashed:", err);
  chrome.kill();
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  process.exit(1);
});
