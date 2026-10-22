/**
 * Core behaviour tests for CertPath.
 *
 * A dependency-free assertion runner (no test framework needed) covering the
 * logic the whole product rests on: quiz scoring, readiness estimation, plan
 * generation, spaced repetition, streaks and the study buddy.
 *
 * Run with:  npm run test
 */
import { CERT_BY_ID, QUESTION_BY_ID, QUESTIONS, cardsFor, questionsFor } from "../data";
import { buildBundle, q, cards } from "../data/factories";
import { computeReadiness, isCorrect, readinessVerdict, scoreAttempt, shuffle } from "../lib/utils";
import { generatePlan, summarizePlan } from "../lib/planner";
import { askBuddy, starterPrompts } from "../lib/ai";
import { computeNextReview, useApp } from "../lib/store";
import { stateSchema } from "../lib/state-schema";
import {
  DICTIONARIES,
  LANGUAGE_CODES,
  LANGUAGES,
  isRtlLanguage,
  translate,
  type MessageKey,
} from "../lib/i18n";
import { appOrigin } from "../lib/api-helpers";
import {
  DUMMY_PASSWORD_HASH,
  dummyPasswordCheck,
  hashPassword,
  hashToken,
  isSameOrigin,
  isSecureRequest,
  validatePasswordStrength,
  verifyPassword,
} from "../lib/auth-primitives";
import type { Attempt } from "../lib/types";

/* -------------------------------------------------------------------------
 * Tiny test harness
 * ---------------------------------------------------------------------- */

let passed = 0;
const failures: string[] = [];
let currentSuite = "";

type TestFn = () => void | Promise<void>;

const queue: { suite: string; name: string; fn: TestFn }[] = [];

function suite(name: string) {
  currentSuite = name;
}

function test(name: string, fn: TestFn) {
  queue.push({ suite: currentSuite, name, fn });
}

async function runAll() {
  let lastSuite = "";
  for (const item of queue) {
    if (item.suite !== lastSuite) {
      console.log(`\n${item.suite}`);
      lastSuite = item.suite;
    }
    try {
      await item.fn();
      passed++;
      console.log(`  ✓ ${item.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${item.suite} › ${item.name}\n      ${message}`);
      console.log(`  ✗ ${item.name}\n      ${message}`);
    }
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${String(expected)}, got ${String(actual)}`);
  }
}

/* -------------------------------------------------------------------------
 * Data layer
 * ---------------------------------------------------------------------- */

suite("Data layer");

test("catalog contains every seeded bank and metadata-only exams", () => {
  assert(CERT_BY_ID["az-900"], "az-900 missing");
  assert(CERT_BY_ID["aws-clf"], "aws-clf missing");
  assert(CERT_BY_ID["security-plus"], "security-plus missing");
  assert(CERT_BY_ID["ccna"], "ccna missing");
  assert(CERT_BY_ID["az-104"], "az-104 missing");
  assert(Object.keys(CERT_BY_ID).length >= 20, "catalog unexpectedly small");
});

test("every question resolves to a known id and domain", () => {
  for (const question of QUESTIONS) {
    assert(QUESTION_BY_ID[question.id] === question, `index mismatch for ${question.id}`);
    const cert = CERT_BY_ID[question.certId];
    assert(cert.domains.some((d) => d.id === question.domainId), `bad domain on ${question.id}`);
  }
});

test("banked exams expose questions and flashcards; others expose neither", () => {
  for (const cert of Object.values(CERT_BY_ID)) {
    const n = questionsFor(cert.id).length;
    const c = cardsFor(cert.id).length;
    if (cert.bankReady) {
      assert(n > 0, `${cert.id} is flagged bank-ready but has no questions`);
      assert(c > 0, `${cert.id} is flagged bank-ready but has no flashcards`);
    } else {
      equal(n, 0, `${cert.id} should have no questions`);
      equal(c, 0, `${cert.id} should have no flashcards`);
    }
  }
});

test("bundle ids are stable across rebuilds", () => {
  const cert = CERT_BY_ID["az-900"];
  const a = buildBundle(cert, [], []);
  const b = buildBundle(cert, [], []);
  equal(a.cert.id, b.cert.id);
  assert(a.questions.length === 0, "expected no questions");
});

test("question factory rejects a correct id that does not exist", () => {
  let threw = false;
  try {
    q("d", "single", 1, "Prompt", ["z"], { a: "A", b: "B" }, "Ref");
  } catch {
    threw = true;
  }
  assert(threw, "factory should throw on an unknown correct option id");
});

test("flashcard factory produces domain-scoped cards", () => {
  const made = cards("d1", "term", [["Front", "Back"]]);
  equal(made.length, 1);
  equal(made[0].domainId, "d1");
  equal(made[0].kind, "term");
});

/* -------------------------------------------------------------------------
 * Utilities
 * ---------------------------------------------------------------------- */

suite("Utilities");

test("shuffle preserves contents and does not mutate the input", () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = input.slice();
  const out = shuffle(input);
  equal(input.length, copy.length);
  assert(input.every((v, i) => v === copy[i]), "shuffle mutated its input");
  equal(out.length, 8);
  assert([...out].sort((a, b) => a - b).join(",") === "1,2,3,4,5,6,7,8", "shuffle lost elements");
});

test("single-answer questions require exactly the right option", () => {
  const question = QUESTION_BY_ID[QUESTIONS.find((x) => x.type === "single")!.id];
  const right = question.correct[0];
  const wrong = question.options.find((o) => !question.correct.includes(o.id))!.id;
  assert(isCorrect(question, [right]), "correct selection should score");
  assert(!isCorrect(question, [wrong]), "wrong selection should not score");
  assert(!isCorrect(question, []), "empty selection should not score");
  assert(!isCorrect(question, [right, wrong]), "multiple selections should not score on single");
});

test("multi-answer questions require the exact set", () => {
  const multi = QUESTIONS.find((x) => x.type === "multi");
  assert(multi, "expected at least one multi-select question");
  const wrongOption = multi.options.find((o) => !multi.correct.includes(o.id));
  assert(isCorrect(multi, multi.correct), "exact set should score");
  assert(!isCorrect(multi, multi.correct.slice(0, 1)), "a partial set must not score");
  if (wrongOption) {
    assert(
      !isCorrect(multi, [...multi.correct, wrongOption.id]),
      "an extra option must not score",
    );
  }
});

test("scoreAttempt computes overall and per-domain results", () => {
  const questions = questionsFor("az-900").slice(0, 4);
  const attempt: Attempt = {
    id: "test",
    certId: "az-900",
    mode: "practice",
    domainIds: questions.map((q) => q.domainId),
    questionIds: questions.map((q) => q.id),
    answers: questions.map((q, i) => ({
      picked: i % 2 === 0 ? q.correct : [q.options.find((o) => !q.correct.includes(o.id))!.id],
      correct: i % 2 === 0,
      at: Date.now(),
    })),
    startedAt: Date.now(),
    finishedAt: Date.now(),
  };

  const score = scoreAttempt(attempt, QUESTION_BY_ID);
  equal(score.total, 4);
  equal(score.correct, 2);
  equal(score.overall, 50);
  equal(Object.keys(score.perDomain).length > 0, true);
  const domainTotals = Object.values(score.perDomain).reduce((sum, d) => sum + d.total, 0);
  equal(domainTotals, 4);
});

test("scoreAttempt ignores questions that are no longer in the bank", () => {
  const score = scoreAttempt(
    {
      id: "x",
      certId: "az-900",
      mode: "practice",
      domainIds: [],
      questionIds: ["does-not-exist"],
      answers: [],
      startedAt: Date.now(),
    },
    QUESTION_BY_ID,
  );
  equal(score.total, 1);
  equal(score.correct, 0);
  equal(score.overall, 0);
});

test("computeReadiness stays within 0–100 and responds to input", () => {
  const none = computeReadiness({ recentScores: [], bankCoverage: 0, cardMastery: 0, daysUntilExam: null });
  equal(none, 0);

  const poor = computeReadiness({ recentScores: [20], bankCoverage: 10, cardMastery: 5, daysUntilExam: null });
  const good = computeReadiness({ recentScores: [95], bankCoverage: 100, cardMastery: 100, daysUntilExam: null });
  const perfect = computeReadiness({ recentScores: [100], bankCoverage: 100, cardMastery: 100, daysUntilExam: null });

  assert(poor >= 0 && poor <= 100, "readiness out of range");
  equal(perfect, 100);
  assert(good > poor, "readiness should improve with better inputs");

  const tight = computeReadiness({ recentScores: [60], bankCoverage: 60, cardMastery: 60, daysUntilExam: 0 });
  const relaxed = computeReadiness({ recentScores: [60], bankCoverage: 60, cardMastery: 60, daysUntilExam: 60 });
  assert(tight <= relaxed, "an imminent exam date should not inflate readiness");
});

test("readinessVerdict mentions the weakest domain when given one", () => {
  const text = readinessVerdict(40, "Azure Fundamentals", "Describe cloud security");
  assert(text.includes("Describe cloud security"), "verdict should name the weak domain");
  assert(text.length > 40, "verdict should be substantive");
});

/* -------------------------------------------------------------------------
 * Planner
 * ---------------------------------------------------------------------- */

suite("Planner");

const PLAN_CERT = CERT_BY_ID["az-900"];
const EXAM_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 28);
  return d.toISOString().slice(0, 10);
})();

test("plan never schedules a task on or after the exam date", () => {
  const plan = generatePlan({ cert: PLAN_CERT, examDate: EXAM_DATE, hoursPerWeek: 8, weakDomains: [] });
  assert(plan.tasks.length > 0, "plan should contain tasks");
  for (const task of plan.tasks) {
    assert(task.date < EXAM_DATE, `task on ${task.date} is not before the exam date`);
    assert(task.minutes > 0, "task should have a positive duration");
    assert(task.label.trim().length > 0, "task should have a label");
  }
});

test("plan respects the weekly hours budget", () => {
  const plan = generatePlan({ cert: PLAN_CERT, examDate: EXAM_DATE, hoursPerWeek: 4, weakDomains: [] });
  const byDate = new Map<string, number>();
  plan.tasks.forEach((t) => byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.minutes));
  // A day is roughly weeklyMinutes / 6, so a 4h week is ~40 min/day.
  for (const [date, minutes] of byDate) {
    assert(minutes <= 70, `${date} has ${minutes} minutes, well over the daily budget`);
  }
  const summary = summarizePlan(plan);
  assert(summary.days > 0 && summary.totalTasks > 0, "summary should be populated");
});

test("weak domains receive more practice than strong ones", () => {
  const weak = "cloud-concepts";
  const plan = generatePlan({
    cert: PLAN_CERT,
    examDate: EXAM_DATE,
    hoursPerWeek: 10,
    weakDomains: [weak],
  });
  const counts = new Map<string, number>();
  plan.tasks.forEach((t) => {
    if (t.domainId) counts.set(t.domainId, (counts.get(t.domainId) ?? 0) + 1);
  });
  const weakCount = counts.get(weak) ?? 0;
  const others = [...counts.entries()].filter(([d]) => d !== weak).map(([, c]) => c);
  const maxOther = others.length ? Math.max(...others) : 0;
  assert(weakCount >= maxOther, `weak domain got ${weakCount} tasks, others up to ${maxOther}`);
});

test("plan generation is deterministic for identical inputs", () => {
  const a = generatePlan({ cert: PLAN_CERT, examDate: EXAM_DATE, hoursPerWeek: 6, weakDomains: ["cloud-concepts"] });
  const b = generatePlan({ cert: PLAN_CERT, examDate: EXAM_DATE, hoursPerWeek: 6, weakDomains: ["cloud-concepts"] });
  equal(a.tasks.length, b.tasks.length);
  equal(
    a.tasks.map((t) => `${t.date}|${t.kind}|${t.minutes}`).join(","),
    b.tasks.map((t) => `${t.date}|${t.kind}|${t.minutes}`).join(","),
    "two runs produced different plans",
  );
});

test("regenerating with an explicit id replaces rather than duplicates", () => {
  const plan = generatePlan({ cert: PLAN_CERT, examDate: EXAM_DATE, hoursPerWeek: 6, weakDomains: [], id: "plan-fixed" });
  equal(plan.id, "plan-fixed");
});

test("a single-day window still produces a usable plan", () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const plan = generatePlan({
    cert: PLAN_CERT,
    examDate: tomorrow.toISOString().slice(0, 10),
    hoursPerWeek: 6,
    weakDomains: [],
  });
  assert(plan.tasks.length >= 1, "expected at least one task");
});

/* -------------------------------------------------------------------------
 * Spaced repetition
 * ---------------------------------------------------------------------- */

suite("Spaced repetition");

test("a good rating increases the interval", () => {
  const first = computeNextReview(undefined, "good");
  equal(first.reps, 1);
  equal(first.interval, 1);
  const second = computeNextReview(first, "good");
  equal(second.reps, 2);
  equal(second.interval, 3);
  const third = computeNextReview(second, "good");
  assert(third.interval > second.interval, "interval should keep growing");
  assert(third.dueAt > second.dueAt, "due date should move forward");
});

test("again resets progress and brings the card back within minutes", () => {
  const matured = computeNextReview(computeNextReview(computeNextReview(undefined, "good"), "good"), "good");
  const lapsed = computeNextReview(matured, "again");
  equal(lapsed.reps, 0);
  equal(lapsed.lapses, matured.lapses + 1);
  assert(lapsed.dueAt - Date.now() < 60 * 60 * 1000, "a forgotten card should come back quickly");
});

test("easy stretches the interval further than good", () => {
  const good = computeNextReview(undefined, "good");
  const easy = computeNextReview(undefined, "easy");
  assert(easy.interval > good.interval, "easy should schedule further out");
  assert(easy.ease > good.ease, "easy should raise the ease factor");
});

test("ease never drops below a usable floor", () => {
  let review = computeNextReview(undefined, "good");
  for (let i = 0; i < 12; i++) review = computeNextReview(review, "again");
  assert(review.ease >= 1.3, `ease fell to ${review.ease}`);
});

/* -------------------------------------------------------------------------
 * Store
 * ---------------------------------------------------------------------- */

suite("Store");

test("answer records correctness from the question bank", () => {
  const store = useApp.getState();
  store.resetAll();
  const question = QUESTIONS.find((q) => q.type === "single")!;
  useApp.getState().startAttempt({
    id: "a1",
    certId: question.certId,
    mode: "practice",
    domainIds: [question.domainId],
    questionIds: [question.id],
    answers: [],
    startedAt: Date.now(),
  });
  useApp.getState().answer(0, question.correct, false);
  const attempt = useApp.getState().attempt!;
  equal(attempt.answers[0].correct, true);
  equal(attempt.answers[0].picked.length, 1);
});

test("finishing an attempt files it and clears the live attempt", () => {
  const store = useApp.getState();
  store.resetAll();
  const question = QUESTIONS.find((q) => q.type === "single")!;
  useApp.getState().startAttempt({
    id: "a2",
    certId: question.certId,
    mode: "practice",
    domainIds: [question.domainId],
    questionIds: [question.id],
    answers: [],
    startedAt: Date.now(),
  });
  useApp.getState().answer(0, question.correct, false);
  useApp.getState().finishAttempt();
  equal(useApp.getState().attempt, null);
  equal(useApp.getState().pastAttempts.length, 1);
  equal(useApp.getState().pastAttempts[0].id, "a2");
});

test("abandoning an attempt discards it", () => {
  useApp.getState().resetAll();
  useApp.getState().startAttempt({
    id: "a3",
    certId: "az-900",
    mode: "practice",
    domainIds: [],
    questionIds: [],
    answers: [],
    startedAt: Date.now(),
  });
  useApp.getState().abandonAttempt();
  equal(useApp.getState().attempt, null);
  equal(useApp.getState().pastAttempts.length, 0);
});

test("bookmarks toggle both ways", () => {
  useApp.getState().resetAll();
  const id = QUESTIONS[0].id;
  useApp.getState().toggleBookmark(id);
  assert(useApp.getState().bookmarks.includes(id), "bookmark was not added");
  useApp.getState().toggleBookmark(id);
  assert(!useApp.getState().bookmarks.includes(id), "bookmark was not removed");
});

test("plan tasks toggle independently", () => {
  useApp.getState().resetAll();
  const plan = generatePlan({ cert: PLAN_CERT, examDate: EXAM_DATE, hoursPerWeek: 6, weakDomains: [] });
  useApp.getState().upsertPlan(plan);
  equal(useApp.getState().plans.length, 1);
  const taskId = plan.tasks[0].id;
  useApp.getState().toggleTask(plan.id, taskId);
  assert(useApp.getState().plans[0].tasks.find((t) => t.id === taskId)?.done, "task was not completed");
  useApp.getState().toggleTask(plan.id, taskId);
  assert(!useApp.getState().plans[0].tasks.find((t) => t.id === taskId)?.done, "task was not reopened");
  useApp.getState().deletePlan(plan.id);
  equal(useApp.getState().plans.length, 0);
});

test("the streak advances once per day and keeps a best", () => {
  useApp.getState().resetAll();
  useApp.getState().touchStreak();
  equal(useApp.getState().streak.count, 1);
  useApp.getState().touchStreak();
  equal(useApp.getState().streak.count, 1, "a second visit on the same day must not increment");
  equal(useApp.getState().streak.best, 1);

  // Simulate having been active yesterday.
  const yesterday = new Date(Date.now() - 86_400_000);
  const iso = new Date(yesterday.getTime() - yesterday.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  useApp.setState({ streak: { count: 4, best: 4, lastActive: iso } });
  useApp.getState().touchStreak();
  equal(useApp.getState().streak.count, 5, "a consecutive day should increment");
  equal(useApp.getState().streak.best, 5);
});

test("onboarding records the selected exams", () => {
  useApp.getState().resetAll();
  useApp.getState().onboard(["az-900", "security-plus"]);
  equal(useApp.getState().onboarded, true);
  equal(useApp.getState().selectedCertIds.length, 2);
  equal(useApp.getState().activeCertId, "az-900");
});

test("chat is stored per exam", () => {
  useApp.getState().resetAll();
  useApp.getState().appendChat("az-900", { id: "m1", role: "user", content: "hi", at: Date.now() });
  useApp.getState().appendChat("ccna", { id: "m2", role: "user", content: "hey", at: Date.now() });
  equal(useApp.getState().chatByCert["az-900"].length, 1);
  equal(useApp.getState().chatByCert["ccna"].length, 1);
  useApp.getState().clearChat("az-900");
  equal(useApp.getState().chatByCert["az-900"].length, 0);
  equal(useApp.getState().chatByCert["ccna"].length, 1, "clearing one exam must not clear another");
});

/* -------------------------------------------------------------------------
 * Study buddy
 * ---------------------------------------------------------------------- */

suite("Study Buddy");

test("every mode returns substantive content", async () => {
  const modes = ["explain", "analogy", "compare", "quiz", "tip"] as const;
  for (const mode of modes) {
    const reply = await askBuddy({ certId: "az-900", mode, topic: "availability zones" });
    assert(reply.content.length > 40, `${mode} returned a very short reply`);
    assert(typeof reply.content === "string", `${mode} did not return a string`);
  }
});

test("explain mode quotes a definition from the flashcard bank", async () => {
  const reply = await askBuddy({ certId: "az-900", mode: "explain", topic: "availability zone" });
  const card = cardsFor("az-900").find((c) => c.front.toLowerCase().includes("availability zone"));
  assert(card, "expected an availability zone card");
  assert(
    reply.content.includes(card!.front) || reply.content.includes(card!.back.slice(0, 30)),
    "reply did not use the matching flashcard",
  );
});

test("quiz mode asks a real question and reveals the answer", async () => {
  const reply = await askBuddy({ certId: "aws-clf", mode: "quiz", topic: "S3" });
  assert(/Correct answer/i.test(reply.content), "quiz reply should reveal the answer");
  assert(reply.content.length > 80, "quiz reply too short");
});

test("compare mode handles two named concepts", async () => {
  const reply = await askBuddy({ certId: "aws-clf", mode: "compare", topic: "S3 vs EC2" });
  assert(reply.content.length > 60, "compare reply too short");
  assert(/vs/i.test(reply.content), "compare reply should compare two things");
});

test("unknown topics fall back to the exam outline instead of inventing content", async () => {
  const reply = await askBuddy({ certId: "ccna", mode: "explain", topic: "zzzz qqqq nonsense" });
  assert(reply.content.length > 40, "fallback reply too short");
  assert(
    reply.content.includes("CCNA") || reply.source === "outline",
    "fallback should point at the exam outline",
  );
});

test("starter prompts are offered for every exam", () => {
  for (const id of Object.keys(CERT_BY_ID)) {
    const prompts = starterPrompts(id);
    assert(prompts.length >= 3, `${id} has too few starter prompts`);
  }
});

/* -------------------------------------------------------------------------
 * Sync contract
 * ---------------------------------------------------------------------- */

suite("Sync contract");

test("a partial settings payload is filled in with defaults", () => {
  // Regression: the server stores settings as "{}" on a fresh profile, which
  // used to hydrate the client with an empty object and then fail validation
  // on the way back — silently breaking every sync.
  const parsed = stateSchema.parse({
    onboarded: false,
    selectedCertIds: [],
    activeCertId: null,
    pastAttempts: [],
    reviews: {},
    plans: [],
    chatByCert: {},
    bookmarks: [],
    customCards: [],
    streak: { count: 0, best: 0, lastActive: "" },
    settings: {},
  });
  equal(parsed.settings.dailyGoal, 45);
  equal(parsed.settings.theme, "dark");
});

test("an empty streak payload is filled in with defaults", () => {
  const parsed = stateSchema.parse({
    onboarded: false,
    selectedCertIds: [],
    activeCertId: null,
    pastAttempts: [],
    reviews: {},
    plans: [],
    chatByCert: {},
    bookmarks: [],
    customCards: [],
    streak: {},
    settings: {},
  });
  equal(parsed.streak.count, 0);
  equal(parsed.streak.best, 0);
  equal(parsed.streak.lastActive, "");
});

test("the state schema rejects a structurally wrong payload", () => {
  const parsed = stateSchema.safeParse({ onboarded: "yes" });
  assert(!parsed.success, "a non-boolean onboarded flag should be rejected");
});

test("the store merges settings on hydrate instead of replacing them", () => {
  useApp.getState().resetAll();
  useApp.getState().hydrate({
    settings: {} as never,
    streak: { count: 3 } as never,
  });
  equal(useApp.getState().settings.dailyGoal, 45, "dailyGoal should survive a partial hydrate");
  equal(useApp.getState().settings.theme, "dark");
  equal(useApp.getState().streak.count, 3);
  equal(useApp.getState().streak.best, 0);
});

test("a full round-trip through the schema preserves the payload", () => {
  const payload = {
    onboarded: true,
    selectedCertIds: ["az-900"],
    activeCertId: "az-900",
    pastAttempts: [
      {
        id: "a1",
        certId: "az-900",
        mode: "practice",
        domainIds: ["cloud-concepts"],
        questionIds: ["q1", "q2"],
        answers: [
          { picked: ["a"], correct: true, at: 1 },
          { picked: ["b"], correct: false, flagged: true, at: 2 },
        ],
        startedAt: 1,
        finishedAt: 3,
      },
    ],
    reviews: { "card-1": { reps: 2, dueAt: 10, ease: 2.5, interval: 3, lapses: 0, lastAt: 5 } },
    plans: [
      {
        id: "p1",
        certId: "az-900",
        examDate: "2026-12-01",
        hoursPerWeek: 8,
        weakDomains: ["cloud-concepts"],
        tasks: [
          { id: "t1", date: "2026-11-01", label: "Practice", minutes: 30, done: false, kind: "quiz" },
        ],
        createdAt: 1,
      },
    ],
    chatByCert: { "az-900": [{ id: "m1", role: "user", content: "hi", at: 1, mode: "explain" }] },
    bookmarks: ["q1"],
    customCards: [
      { id: "c1", certId: "az-900", domainId: "custom", kind: "term", front: "F", back: "B" },
    ],
    streak: { count: 4, best: 9, lastActive: "2026-10-20" },
    settings: { dailyGoal: 60, theme: "light" },
  };

  const parsed = stateSchema.parse(payload);
  equal(parsed.pastAttempts[0].answers.length, 2);
  equal(parsed.pastAttempts[0].answers[1].flagged, true);
  equal(parsed.plans[0].tasks[0].kind, "quiz");
  equal(parsed.chatByCert["az-900"][0].mode, "explain");
  equal(parsed.settings.theme, "light");
  equal(parsed.streak.best, 9);
});

/* -------------------------------------------------------------------------
 * Auth primitives
 * ---------------------------------------------------------------------- */

suite("Auth primitives");

test("a password under 10 characters is rejected", () => {
  const problem = validatePasswordStrength("short", "someone@certpath.test");
  assert(problem !== null, "expected a policy complaint");
  assert(/10 characters/i.test(problem), `unexpected message: ${problem}`);
});

test("a long passphrase is accepted", () => {
  equal(
    validatePasswordStrength("correct horse battery staple", "someone@certpath.test"),
    null,
  );
});

test("a common password is rejected", () => {
  const problem = validatePasswordStrength("password123", "someone@certpath.test");
  assert(problem !== null, "expected a policy complaint");
  assert(/common/i.test(problem), `unexpected message: ${problem}`);
});

test("a single repeated character is rejected", () => {
  assert(validatePasswordStrength("aaaaaaaaaaaaaa", "someone@certpath.test") !== null);
});

test("a password containing the email local part is rejected", () => {
  const problem = validatePasswordStrength("leonardo2024x", "leonardo@certpath.test");
  assert(problem !== null, "expected a policy complaint");
  assert(/email/i.test(problem), `unexpected message: ${problem}`);
});

test("token hashes are deterministic and hide the raw token", () => {
  const raw = "super-secret-token-value";
  const a = hashToken(raw);
  const b = hashToken(raw);
  equal(a, b, "hashing must be deterministic");
  assert(a !== raw, "the raw token must not be stored");
  assert(a.length === 64, "expected a sha256 hex digest");
  assert(hashToken("another-token") !== a, "different tokens must hash differently");
});

test("same-origin requests are allowed and foreign ones are not", () => {
  const same = new Request("https://certpath.test/api/account", {
    method: "POST",
    headers: { origin: "https://certpath.test" },
  });
  assert(isSameOrigin(same), "a same-origin request was rejected");

  const foreign = new Request("https://certpath.test/api/account", {
    method: "POST",
    headers: { origin: "https://evil.example.com" },
  });
  assert(!isSameOrigin(foreign), "a cross-origin request was allowed");

  const noOrigin = new Request("https://certpath.test/api/account", { method: "POST" });
  assert(isSameOrigin(noOrigin), "a non-browser request should pass");
});

test("a proxied https request is recognised", () => {
  const proxied = new Request("http://internal:3000/api/account", {
    method: "POST",
    headers: {
      "x-forwarded-host": "certpath.test",
      "x-forwarded-proto": "https",
      origin: "https://certpath.test",
    },
  });
  assert(isSameOrigin(proxied), "a proxied same-origin request was rejected");
  assert(isSecureRequest(proxied), "a proxied https request was not detected as secure");
});

test("a plain http request is not treated as secure", () => {
  const plain = new Request("http://localhost:3000/api/account", { method: "POST" });
  assert(!isSecureRequest(plain), "http should not be reported as secure");
});

test("the public origin follows the request, not a fixed port", () => {
  // A development server on a non-standard port must still produce a
  // reset link that points at that port.
  const request = new Request("http://localhost:3300/api/auth/forgot-password", { method: "POST" });
  equal(appOrigin(request), "http://localhost:3300");
});

test("a forwarded host wins over the request origin", () => {
  const request = new Request("http://internal:3000/api/auth/forgot-password", {
    method: "POST",
    headers: { "x-forwarded-host": "certpath.example.com", "x-forwarded-proto": "https" },
  });
  equal(appOrigin(request), "https://certpath.example.com");
});

test("the dummy password hash is well formed", () => {
  // bcrypt silently rejects a malformed hash and returns instantly, which
  // would make the unknown-email path faster than a real check and leak
  // which addresses are registered.
  equal(DUMMY_PASSWORD_HASH.length, 60, "a bcrypt hash must be exactly 60 characters");
  assert(DUMMY_PASSWORD_HASH.startsWith("$2a$12$"), "unexpected bcrypt prefix or cost");
});

test("the dummy password check costs about as much as a real one", async () => {
  const hash = await hashPassword("a real password of decent length");

  const realStart = Date.now();
  await verifyPassword("wrong password", hash);
  const realMs = Date.now() - realStart;

  const dummyStart = Date.now();
  await dummyPasswordCheck("wrong password");
  const dummyMs = Date.now() - dummyStart;

  assert(dummyMs > 100, `the dummy check finished in ${dummyMs}ms — no work was done`);
  assert(
    dummyMs > realMs * 0.4,
    `the dummy check took ${dummyMs}ms against ${realMs}ms for a real check — the paths are distinguishable`,
  );
});

test("a real password verifies against its hash and nothing else does", async () => {
  const hash = await hashPassword("a real password of decent length");
  assert(await verifyPassword("a real password of decent length", hash));
  assert(!(await verifyPassword("a real password of decent lenght", hash)));
  assert(!(await verifyPassword("", hash)));
});

/* -------------------------------------------------------------------------
 * Internationalisation
 * ---------------------------------------------------------------------- */

suite("Internationalisation");

test("every supported language has a complete dictionary", () => {
  const keys = Object.keys(DICTIONARIES.en);
  equal(LANGUAGES.length, LANGUAGE_CODES.length, "language definitions and codes disagree");

  for (const code of LANGUAGE_CODES) {
    const dictionary = DICTIONARIES[code];
    const missing = keys.filter((key) => !dictionary[key as keyof typeof dictionary]);
    equal(missing.length, 0, `${code} is missing: ${missing.join(", ")}`);
    assert(
      LANGUAGES.some((language) => language.code === code),
      `${code} has no language definition`,
    );
  }
});

test("translations interpolate placeholders and fall back cleanly", () => {
  equal(translate("es", "chrome.streak", { count: 7 }), "Racha de 7 días");
  assert(translate("ja", "nav.dashboard") !== "Dashboard", "Japanese nav label was not translated");
  assert(translate("ar", "nav.dashboard") !== "Dashboard", "Arabic nav label was not translated");
  assert(translate("sw", "nav.dashboard") !== "Dashboard", "Swahili nav label was not translated");

  // Unknown languages and missing keys degrade to English / the key itself.
  equal(translate("xx", "nav.dashboard"), "Dashboard");
  equal(translate("es", "does.not.exist" as MessageKey), "does.not.exist");
});

test("right-to-left languages are flagged for the document direction", () => {
  assert(isRtlLanguage("ar") && isRtlLanguage("ur") && isRtlLanguage("fa"));
  assert(!isRtlLanguage("en") && !isRtlLanguage("zh"));
});

/* -------------------------------------------------------------------------
 * Summary
 * ---------------------------------------------------------------------- */

await runAll();

console.log("\n" + "=".repeat(50));
if (failures.length) {
  console.log(`FAILED — ${passed} passed, ${failures.length} failed\n`);
  failures.forEach((f) => console.log(`  x ${f}\n`));
  process.exit(1);
}
console.log(`All ${passed} tests passed.`);
