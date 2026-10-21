# CertPath — multi-vendor IT exam-prep platform

Independent exam-preparation platform. **Not affiliated with, endorsed by, or sponsored by
Microsoft, AWS, Google, CompTIA, Cisco, ISC2, PMI, the Linux Foundation, VMware or any other
certification vendor.**

Every practice question and flashcard is original. Readiness figures are estimates. The only way
to earn a certification is to take the vendor's official exam.

---

## What it does

| Module | Route | What it is |
|---|---|---|
| Dashboard | `/dashboard` | Readiness ring, today's plan, cards due, quick quiz, streak, onboarding |
| Catalog | `/catalog` | 21 exams with full outlines, domain weighting and official registration links |
| Quiz | `/quiz` | Domain/difficulty filters, practice vs exam-simulation mode, timed runs, per-domain breakdown, missed-question review |
| Flashcards | `/flashcards` | SM-2 spaced repetition, per-domain and due-only filters, custom cards, keyboard shortcuts |
| Planner | `/planner` | Day-by-day study plan with weak-domain weighting and automatically spaced heavy days |
| Readiness | `/readiness` | Estimate, domain radar, score trend, coverage stats, study milestones |
| Study Buddy | `/buddy` | Explain / analogy / compare / quiz / tip, answered from the platform's own content bank |
| Account | `/account` | Profile, display name, password change, signed-in devices, data counts, account deletion |
| Forgot password | `/forgot-password` | Requests a single-use reset link — identical response whether or not the address exists |
| Reset password | `/reset-password` | Sets a new password from a reset link and signs the user in |
| Policy | `/policy` | Content policy, originality rules, how estimates should be read |

Plus accounts: register, sign in, sign out, sign out everywhere, with your progress stored
server-side and synced across devices.

---

## Architecture

```
app/                 Next.js 14 App Router
  layout.tsx         Root layout — fonts, metadata, Providers
  page.tsx           Public landing page
  policy/            Content policy
  login/ register/   Account screens
  (app)/             Authenticated app shell (sidebar + top bar)
  api/
    auth/            register · login · logout
    me/              GET (restore state) · PUT (sync state)
components/          ui · chrome (sidebar, exam card) · charts · providers · app-shell · auth-form
data/                Static content
  types.ts           Certification · Question · Flashcard
  factories.ts       q() · cards() · buildBundle() · VENDORS
  catalog.ts         Metadata for every exam listed
  certs/*.ts         One file per seeded question bank
  index.ts           Merges seeded banks with the catalog
lib/
  types.ts           Attempt · ReviewState · Plan · ChatMessage · …
  utils.ts           shuffle · isCorrect · scoreAttempt · computeReadiness
  planner.ts         Deterministic day-by-day plan generator
  ai.ts              Study Buddy (deterministic, answers from the content bank)
  store.ts           Zustand store — client cache + optimistic UI
  db.ts              Prisma client singleton
  auth.ts            Sessions, password hashing, reset tokens, cookie handling
  auth-primitives.ts Pure auth logic (token hashing, password policy, origin checks)
  login-throttle.ts  Brute-force throttling
  email.ts           Pluggable email adapter (console / webhook)
  api-helpers.ts     Route guards, error responses, origin checks
  state-io.ts        Store shape ⇄ relational tables
  state-schema.ts    The wire contract for synced state (zod)
prisma/              schema.prisma (SQLite) · schema.postgres.prisma (PostgreSQL)
scripts/             setup · validate-content · test-core · test-auth · browser-check
```

### Data model

```
Certification { id, vendor, examCode, name, level, durationMin, questionCount,
                passingScore, scoreScale, officialExamUrl, domains[{id,name,weight}], nextSteps }
Question      { id, certId, domainId, type: single|multi|scenario, difficulty 1–3,
                prompt, scenario?, options[{id,text,why}], correct[], reference }
Flashcard     { id, certId, domainId, kind: term|service|port|command|framework|acronym,
                front, back }
```

### Authentication

| Concern | How it is handled |
|---|---|
| Passwords | bcrypt, cost 12. Never stored or logged in plain text. |
| Sessions | One opaque random token per signed-in device, in an httpOnly `SameSite=Lax` cookie. Only a keyed HMAC of the token is stored, so a database leak alone cannot be used to impersonate a session. |
| Multiple devices | A user may hold any number of concurrent sessions. Signing in on a phone does **not** sign the user out of their laptop. |
| Session validation | Checked against the database on every request, so a revoked or expired session stops working immediately — not when its cookie finally expires. |
| Session management | `/account` lists every signed-in device with its user agent, address and last activity, and allows revoking one device, the others, or all of them. |
| Brute force | Failed sign-ins are counted per account and per source address. The account lockout doubles with each further failure; the address counter is a high, short-lived volume guard so a shared office IP is not locked out wholesale. |
| Account enumeration | Unknown and known addresses produce byte-identical responses and take indistinguishable time (a dummy bcrypt comparison runs on the unknown path). |
| Password policy | Length-first: at least 10 characters, no common passwords, no single repeated character, and it must not contain the local part of the email address. |
| Password change | Requires the current password, and revokes every other session. |
| Password reset | Single-use, one-hour token stored as a keyed hash. Using it revokes all other sessions. |
| Account deletion | Requires the password and the typed word `DELETE`; cascades away every attempt, plan, card, chat message and session. |
| CSRF | `SameSite=Lax` cookies plus an explicit `Origin` check on every state-changing endpoint. |
| Transport | The session cookie is marked `Secure` only when the request actually arrived over HTTPS, so plain-HTTP deployments still work. |

### Persistence

Two layers, deliberately:

- **Client cache** — a Zustand store persisted to `localStorage`. It is the source of truth for
  the UI, so every screen renders instantly and works offline. The storage adapter never throws:
  if `localStorage` is unavailable the store falls back to an in-memory map.
- **Server of record** — Postgres (or SQLite for zero-setup dev) via Prisma. The sync engine
  mirrors the durable parts of the store to the account on a 1.2 s debounce, and restores them on
  sign-in. The in-progress quiz attempt is local-only by design.

Sessions use a random opaque token in an httpOnly cookie; only a keyed hash of the token is
stored server-side, so the session is revocable. Passwords are hashed with bcrypt.

---

## Running it

```bash
npm install
npm run setup      # picks the DB dialect, generates the client, creates the schema
npm run dev        # http://localhost:3000
```

`npm run setup` reads `DATABASE_URL` to decide which dialect to use:

| `DATABASE_URL` | Dialect | Result |
|---|---|---|
| `file:./dev.db` | SQLite | Zero setup — a local file database |
| `postgresql://…` | PostgreSQL | Production |

Switch dialects explicitly:

```bash
npm run db:use:postgres   # copies the Postgres schema into place
npm run db:use:sqlite     # back to the local file database
npx prisma migrate dev --name init   # then create a migration for Postgres
```

### Environment

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | for accounts | Postgres or SQLite connection string. Unset ⇒ the platform runs account-free, storing progress on the device only. |
| `AUTH_SECRET` | for production | 16+ character secret used to key the HMAC behind session and reset-token hashes. A development fallback is used if it is unset. |
| `EMAIL_WEBHOOK_URL` | optional | Any service accepting a JSON POST with `{ to, subject, text, html }`. Without it the reset link is written to the server log and returned in the API response. |
| `EMAIL_WEBHOOK_TOKEN` | optional | Bearer token for the webhook above. |
| `NEXT_PUBLIC_APP_URL` | optional | Public origin used to build links in emails. Falls back to the request origin. |

---

## Verification

```bash
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run test             # 56 behaviour tests (scoring, SRS, planner, store, sync, auth primitives)
npm run validate:content # structural audit of every question bank and deck
npm run test:auth        # 25 end-to-end auth tests against a running server
npm run test:browser     # 43 end-to-end checks in headless Chrome (needs a running server)
```

`validate:content` is the important one for content work — it fails on dangling domain
references, answer keys that point at options which do not exist, single-answer questions with
several correct answers, multi-select questions where every option is correct, scenarios with no
scenario text, and **options whose explanation contradicts the answer key**.

`test:auth` drives the real HTTP API: registration, sign-in, two devices signing in at once,
individual and bulk session revocation, password change, password reset, account deletion,
brute-force throttling, cross-origin rejection, and a timing check proving the
unknown-address path costs the same as the known one.

`test:browser` drives the real application over the DevTools Protocol: it registers an account,
completes onboarding, plays a quiz to the results screen, rates a flashcard, generates a study
plan, asks the Study Buddy a question, resets the password through the UI, and then asserts that
the attempts and reviews actually reached the server. Add `--guest` to run the same journey
against a server with no database configured, where progress stays on the device:

```bash
npm run test:browser -- http://localhost:3000 --guest
```

---

## Content

21 exams are listed. Four ship with a complete original bank:

| Exam | Questions | Flashcards | Domains |
|---|---|---|---|
| AZ-900 (Azure Fundamentals) | 49 | 106 | 4 |
| AWS-CLF (Cloud Practitioner) | 36 | 48 | 4 |
| SY0-701 (Security+) | 36 | 55 | 5 |
| CCNA 200-301 | 36 | 55 | 6 |

**157 questions · 264 flashcards · 100 single-answer · 23 select-all-that-apply · 34 scenario.**

Every other exam in the catalog carries its full outline, domain weighting, difficulty,
passing-score scale and official registration link, so it can be planned against before a bank
ships.

### Adding an exam (zero code changes)

1. Create `data/certs/<slug>.ts` exporting `{ cert, questions, flashcards }` using the `q()` and
   `cards()` factories.
2. Add it to the `SEEDED` array in `data/index.ts`.

Every module — quiz, flashcards, planner, buddy, readiness, catalog — picks it up automatically.
Then run `npm run validate:content`.

```ts
import { cards, q } from "../factories";
import type { Certification } from "../types";

export const cert: Certification = { id: "net-plus", /* … */ };

export const questions = [
  q("fundamentals", "single", 2, "What is the OSI layer that routes packets?",
    ["b"], { a: "Data link", b: "Network", c: "Transport", d: "Session" },
    "ISO/IEC 7498-1"),
];

export const flashcards = [
  ...cards("fundamentals", "term", [["PDU", "Protocol data unit — a unit of data exchanged between peers."]]),
];
```

The factory generates stable ids from the exam id and a slug of the prompt, so an id never
changes across edits and can be used as a foreign key.

---

## Extending

- **A real AI buddy** — `askBuddy()` in `lib/ai.ts` is an interface, not an implementation
  detail. Swap in a remote model by providing another function with the same signature; the rest
  of the app calls it through one place.
- **Community question banks** — add `source: "community"` and `status: "pending"` to
  `Question`, then review before merging into a bundle (see `/policy`).
- **More seeded banks** — follow the `data/certs/*.ts` recipe above.
- **Push notifications** — the store already tracks `streak.lastActive` and per-card `dueAt`,
  which is everything a digest job needs.

---

## Compliance

- Disclaimers in the footer, sidebar, onboarding, landing page and policy page
- Readiness is always labelled an estimate; milestones are labelled study milestones, never
  credentials
- "Take the official exam" link on every exam card and on every results screen
- No vendor logos anywhere — accent colours only
- All content is original; the policy explicitly forbids dumps, and the validator enforces the
  originality invariants that can be checked mechanically
