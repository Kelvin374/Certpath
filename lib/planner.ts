import type { Certification } from "@/data/types";
import { addDaysISO, clamp, daysBetween, todayISO, uid } from "./utils";
import type { Plan, PlanTask, TaskKind } from "./types";

export interface GeneratePlanInput {
  cert: Certification;
  /** Target exam date, `YYYY-MM-DD`. */
  examDate: string;
  hoursPerWeek: number;
  /** Domains to emphasise. */
  weakDomains: string[];
  /** Reuse an existing plan id so regenerating replaces rather than duplicates. */
  id?: string;
}

/* -------------------------------------------------------------------------
 * Deterministic randomness
 * ---------------------------------------------------------------------- */

/** mulberry32 — small, fast, seedable PRNG. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* -------------------------------------------------------------------------
 * Domain rotation
 * ---------------------------------------------------------------------- */

/**
 * Order a multiset of domain ids so that no two adjacent entries are equal,
 * while preserving every id's multiplicity.
 *
 * A plain shuffle followed by "drop consecutive duplicates" would silently
 * discard the extra copies that give weak domains their boost, so the
 * interleaving is done explicitly instead.
 */
function spreadWithoutAdjacent(ids: string[]): string[] {
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));

  const out: string[] = [];
  const remaining = new Map(counts);
  let previous: string | null = null;

  while (out.length < ids.length) {
    let best: string | null = null;
    let bestCount = -1;
    for (const [id, count] of remaining) {
      if (count <= 0 || id === previous) continue;
      if (count > bestCount) {
        best = id;
        bestCount = count;
      }
    }
    if (best === null) {
      // Only the previous id has copies left — take it and accept the repeat.
      const only = [...remaining.entries()].find(([, c]) => c > 0);
      if (!only) break;
      best = only[0];
    }
    out.push(best);
    remaining.set(best, remaining.get(best)! - 1);
    previous = best;
  }

  return out;
}

/**
 * Build a domain sequence where weak domains appear more often.
 *
 * Domains are interleaved rather than grouped so consecutive study days
 * never hammer the same weak domain back-to-back.
 */
function buildDomainRotation(cert: Certification, weakDomains: string[], seed: number): string[] {
  const rand = mulberry32(seed);
  const weak = new Set(weakDomains);

  const pool: string[] = [];
  cert.domains.forEach((d) => {
    const boost = weak.has(d.id) ? 3 : 1;
    // Bigger exam weight ⇒ more practice slots.
    const copies = Math.max(1, Math.round((d.weight / 25) * boost));
    for (let i = 0; i < copies; i++) pool.push(d.id);
  });

  // Shuffle first so the ordering is not grouped by domain, then re-interleave.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return spreadWithoutAdjacent(pool);
}

/* -------------------------------------------------------------------------
 * Daily minutes
 * ---------------------------------------------------------------------- */

/** Minutes of study time to target on a given weekday. */
function minutesForDay(base: number, weekday: number): number {
  // 0 = Sunday … 6 = Saturday
  if (weekday === 0) return Math.round(base * 0.4);
  if (weekday === 6) return Math.round(base * 0.6);
  return Math.round(base);
}

/* -------------------------------------------------------------------------
 * Plan generation
 * ---------------------------------------------------------------------- */

export function generatePlan(input: GeneratePlanInput): Plan {
  const { cert, examDate, hoursPerWeek, weakDomains } = input;

  const today = todayISO();
  const totalDays = Math.max(1, daysBetween(today, examDate));
  // The exam day itself is never a study day.
  const studyDays = Math.max(1, totalDays - 1);

  const weeklyMinutes = clamp(hoursPerWeek, 1, 60) * 60;
  const base = weeklyMinutes / 6;

  const seed = seedFrom(`${cert.id}:${examDate}:${hoursPerWeek}:${weakDomains.join(",")}`);
  const rotation = buildDomainRotation(cert, weakDomains, seed);
  let cursor = 0;

  const domainName = (id: string) => cert.domains.find((d) => d.id === id)?.name ?? id;
  const nextDomain = () => {
    if (!rotation.length) return cert.domains[0]?.id ?? "";
    const id = rotation[cursor % rotation.length];
    cursor += 1;
    return id;
  };

  const tasks: PlanTask[] = [];
  const push = (
    date: string,
    kind: TaskKind,
    label: string,
    minutes: number,
    domainId?: string,
  ) => {
    tasks.push({ id: uid("task"), date, label, minutes, done: false, kind, domainId });
  };

  for (let day = 0; day < studyDays; day++) {
    const date = addDaysISO(today, day);
    const d = new Date(`${date}T00:00:00`);
    const weekday = d.getDay();
    const budget = Math.max(10, minutesForDay(base, weekday));
    const daysToExam = totalDays - day;

    // A quiet day the day before the exam — consolidation, not new material.
    if (daysToExam <= 1) {
      push(date, "review", `Light review — ${cert.examCode} key terms`, 20);
      continue;
    }

    let remaining = budget;
    const domain = nextDomain();
    // Flashcards rotate onto a different domain so a single day touches two
    // areas of the outline rather than hammering one.
    const cardDomain = nextDomain();

    // Spaced mock exam: roughly weekly, never in the final three days.
    const isMockDay = day % 7 === 6 && daysToExam > 3 && remaining >= 60;
    if (isMockDay) {
      const mockMinutes = Math.min(60, remaining);
      push(
        date,
        "mock",
        `Timed mock exam — ${cert.examCode} (${cert.questionCount} questions, ${cert.durationMin} min format)`,
        mockMinutes,
      );
      remaining -= mockMinutes;
    }

    // Flashcard review first — it is the cheapest, highest-return task.
    if (remaining >= 15) {
      const cardMinutes = Math.min(remaining, budget >= 90 ? 20 : 15);
      push(date, "cards", `Flashcard review — ${domainName(cardDomain)}`, cardMinutes, cardDomain);
      remaining -= cardMinutes;
    }

    // Practice quiz on the rotating domain.
    if (remaining >= 20) {
      const quizMinutes = Math.min(remaining, budget >= 90 ? 35 : 25);
      push(
        date,
        "quiz",
        `Practice quiz — ${domainName(domain)} (${quizMinutes >= 30 ? 20 : 12} questions)`,
        quizMinutes,
        domain,
      );
      remaining -= quizMinutes;
    }

    // Concept review to fill the rest of the budget.
    if (remaining >= 15) {
      const readMinutes = Math.min(remaining, 30);
      push(
        date,
        "read",
        `Review fundamentals — ${domainName(domain)}`,
        readMinutes,
        domain,
      );
      remaining -= readMinutes;
    }

    // Anything left over becomes an error review pass.
    if (remaining >= 10) {
      push(date, "review", "Review flagged and missed questions", remaining);
    }
  }

  return {
    id: input.id ?? uid("plan"),
    certId: cert.id,
    examDate,
    hoursPerWeek,
    weakDomains: [...new Set(weakDomains)],
    tasks,
    createdAt: Date.now(),
  };
}

export interface PlanSummary {
  totalTasks: number;
  totalMinutes: number;
  days: number;
  averageMinutes: number;
  byKind: Partial<Record<TaskKind, number>>;
}

export function summarizePlan(plan: Plan): PlanSummary {
  const totalMinutes = plan.tasks.reduce((sum, t) => sum + t.minutes, 0);
  const days = new Set(plan.tasks.map((t) => t.date)).size;
  const byKind: Partial<Record<TaskKind, number>> = {};
  plan.tasks.forEach((t) => {
    byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  });
  return {
    totalTasks: plan.tasks.length,
    totalMinutes,
    days,
    averageMinutes: days ? Math.round(totalMinutes / days) : 0,
    byKind,
  };
}

/** Tasks scheduled for a specific date. */
export function tasksForDate(plan: Plan | undefined, date: string): PlanTask[] {
  if (!plan) return [];
  return plan.tasks.filter((t) => t.date === date);
}

/** Upcoming tasks from today onward, capped. */
export function upcomingTasks(plan: Plan | undefined, limit = 5): PlanTask[] {
  if (!plan) return [];
  const today = todayISO();
  return plan.tasks
    .filter((t) => t.date >= today && !t.done)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}
