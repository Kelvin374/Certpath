import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { translate, type LanguageCode } from "./i18n";
import type { Attempt } from "./types";
import type { Question } from "@/data/types";

/* -------------------------------------------------------------------------
 * Class names
 * ---------------------------------------------------------------------- */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */

/** Collision-resistant id, safe for use as a database key. */
export function uid(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/** Fisher–Yates shuffle. Returns a new array; the input is not mutated. */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Local-time ISO date (`YYYY-MM-DD`). */
export function todayISO(d: Date = new Date()): string {
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts ?? { month: "short", day: "numeric" });
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* -------------------------------------------------------------------------
 * Quiz scoring
 * ---------------------------------------------------------------------- */

/**
 * A single-answer question is correct when exactly one option is chosen and
 * it is the right one. A multi-answer question requires the exact set — a
 * partial selection is not correct, matching the scoring used by most
 * certification exams.
 */
export function isCorrect(question: Question, picked: string[]): boolean {
  if (!picked.length) return false;
  if (question.type === "multi") {
    if (picked.length !== question.correct.length) return false;
    const chosen = new Set(picked);
    return question.correct.every((c) => chosen.has(c));
  }
  return picked.length === 1 && question.correct.includes(picked[0]);
}

export interface DomainScore {
  pct: number;
  correct: number;
  total: number;
}

export interface AttemptScore {
  /** Overall percentage, 0–100. */
  overall: number;
  perDomain: Record<string, DomainScore>;
  correct: number;
  total: number;
  /** Per-question correctness, index-aligned with `attempt.questionIds`. */
  results: boolean[];
}

/**
 * Score a finished attempt.
 *
 * `questionMap` is keyed by question id. Results are recomputed from the
 * recorded selections rather than trusted from storage, so a tampered or
 * stale `correct` flag cannot inflate a score.
 */
export function scoreAttempt(
  attempt: Pick<Attempt, "questionIds" | "answers">,
  questionMap: Record<string, Question>,
): AttemptScore {
  const perDomain: Record<string, DomainScore> = {};
  const results: boolean[] = [];
  let correct = 0;

  attempt.questionIds.forEach((qid, index) => {
    const question = questionMap[qid];
    if (!question) {
      results.push(false);
      return;
    }
    const answer = attempt.answers[index];
    const picked = answer?.picked ?? [];
    const ok = isCorrect(question, picked);
    results.push(ok);
    if (ok) correct++;

    const bucket = (perDomain[question.domainId] ??= { pct: 0, correct: 0, total: 0 });
    bucket.total += 1;
    if (ok) bucket.correct += 1;
  });

  Object.values(perDomain).forEach((d) => {
    d.pct = d.total ? Math.round((d.correct / d.total) * 100) : 0;
  });

  const total = attempt.questionIds.length;
  return {
    overall: total ? Math.round((correct / total) * 100) : 0,
    perDomain,
    correct,
    total,
    results,
  };
}

/* -------------------------------------------------------------------------
 * Readiness estimate
 * ---------------------------------------------------------------------- */

export interface ReadinessInput {
  /** Recent practice scores, oldest first, as percentages. */
  recentScores: number[];
  /** Percentage of the question bank the learner has attempted. */
  bankCoverage: number;
  /** Percentage of flashcards the learner has mastered. */
  cardMastery: number;
  /** Days until the target exam, or `null` when no plan exists. */
  daysUntilExam: number | null;
}

/**
 * Practice-readiness estimate, 0–100.
 *
 * This is a *self-assessment aid*, not a prediction of exam results: it
 * combines practice accuracy (the dominant signal), how much of the bank has
 * been seen, and flashcard mastery. The label used in the UI always says
 * "estimate".
 */
export function computeReadiness(input: ReadinessInput): number {
  const { recentScores, bankCoverage, cardMastery, daysUntilExam } = input;

  const recent = recentScores.slice(-5);
  let performance = 0;
  if (recent.length) {
    // Later attempts weigh slightly more.
    let weightSum = 0;
    let scoreSum = 0;
    recent.forEach((score, i) => {
      const w = 1 + i * 0.15;
      weightSum += w;
      scoreSum += score * w;
    });
    performance = scoreSum / weightSum;
  }

  let readiness =
    0.55 * clamp(performance, 0, 100) +
    0.25 * clamp(bankCoverage, 0, 100) +
    0.2 * clamp(cardMastery, 0, 100);

  // Little time left to consolidate weak areas — temper the estimate slightly.
  if (daysUntilExam !== null && daysUntilExam < 10) {
    readiness *= 0.92 + 0.008 * Math.max(daysUntilExam, 0);
  }

  return clamp(Math.round(readiness), 0, 100);
}

export type ReadinessBand = "strong" | "close" | "building" | "early";

export function readinessBand(readiness: number): ReadinessBand {
  if (readiness >= 85) return "strong";
  if (readiness >= 70) return "close";
  if (readiness >= 45) return "building";
  return "early";
}

/** Plain-language verdict for the readiness tracker. */
export function readinessVerdict(
  readiness: number,
  certName: string,
  weakestDomain: string | null,
  language: LanguageCode = "en",
): string {
  const band = readinessBand(readiness);
  const focus = weakestDomain
    ? translate(language, "ready.focusWeak", { domain: weakestDomain })
    : translate(language, "ready.focusNone");
  const vars = { cert: certName, focus };

  switch (band) {
    case "strong":
      return translate(language, "ready.verdictStrong", vars);
    case "close":
      return translate(language, "ready.verdictClose", vars);
    case "building":
      return translate(language, "ready.verdictBuilding", vars);
    default:
      return translate(language, "ready.verdictEarly", vars);
  }
}

/* -------------------------------------------------------------------------
 * Misc selectors
 * ---------------------------------------------------------------------- */

/** Domains of a cert ordered by descending exam weight. */
export function domainsByWeight<T extends { weight: number }>(domains: T[]): T[] {
  return domains.slice().sort((a, b) => b.weight - a.weight);
}

/** Percentage helper that never divides by zero. */
export function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}
