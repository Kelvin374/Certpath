import { prisma } from "./db";
import type { Attempt, ChatMessage, Plan, ReviewState, Settings, Streak } from "./types";
import type { Flashcard } from "@/data/types";

/**
 * Translation layer between the client store shape and the relational
 * tables. The client keeps rich nested objects; the database keeps rows with
 * JSON-encoded list fields so the model works on both SQLite and PostgreSQL.
 */

export interface SyncableState {
  onboarded: boolean;
  selectedCertIds: string[];
  activeCertId: string | null;
  pastAttempts: Attempt[];
  reviews: Record<string, ReviewState>;
  plans: Plan[];
  chatByCert: Record<string, ChatMessage[]>;
  bookmarks: string[];
  customCards: Flashcard[];
  streak: Streak;
  settings: Settings;
}

/* -------------------------------------------------------------------------
 * Encoding helpers
 * ---------------------------------------------------------------------- */

function encode(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

function decode<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * Decode an object column and layer it over a set of defaults.
 *
 * Without this, a column that was written as `{}` would decode to `{}` and
 * silently strip every default field — which then fails validation on the
 * way back in. Merging keeps partial rows usable.
 */
function decodeWithDefaults<T extends object>(value: string | null | undefined, defaults: T): T {
  const parsed = decode<Partial<T>>(value, {});
  if (typeof parsed !== "object" || parsed === null) return defaults;
  return { ...defaults, ...parsed };
}

/** Default settings, shared by the store and the server. */
export const DEFAULT_SETTINGS: Settings = { dailyGoal: 45, theme: "dark", language: "en" };

/** Default streak, shared by the store and the server. */
export const DEFAULT_STREAK: Streak = { count: 0, best: 0, lastActive: "" };

/* -------------------------------------------------------------------------
 * Write
 * ---------------------------------------------------------------------- */

/**
 * Replace the user's stored state.
 *
 * Collections are replaced wholesale (they are small and the client is the
 * source of truth), while flashcard reviews are upserted so a partial sync
 * never loses scheduling history.
 */
export async function saveState(userId: string, state: SyncableState): Promise<void> {
  const attempts = state.pastAttempts.map((a) => ({
    id: a.id,
    userId,
    certId: a.certId,
    mode: a.mode,
    domainIds: encode(a.domainIds),
    questionIds: encode(a.questionIds),
    answers: encode(a.answers),
    startedAt: new Date(a.startedAt),
    finishedAt: a.finishedAt ? new Date(a.finishedAt) : null,
  }));

  const plans = state.plans.map((p) => ({
    id: p.id,
    userId,
    certId: p.certId,
    examDate: p.examDate,
    hoursPerWeek: p.hoursPerWeek,
    weakDomains: encode(p.weakDomains),
    tasks: encode(p.tasks),
    createdAt: new Date(p.createdAt),
  }));

  const messages = Object.entries(state.chatByCert).flatMap(([certId, list]) =>
    list.map((m) => ({
      id: m.id,
      userId,
      certId,
      role: m.role,
      content: m.content,
      mode: m.mode ?? null,
      at: new Date(m.at),
    })),
  );

  const cards = state.customCards.map((c) => ({
    id: c.id,
    userId,
    certId: c.certId,
    front: c.front,
    back: c.back,
    createdAt: new Date(),
  }));

  const reviews = Object.entries(state.reviews).map(([cardId, r]) => ({
    id: `${userId}:${cardId}`,
    userId,
    cardId,
    reps: r.reps,
    dueAt: new Date(r.dueAt),
    ease: r.ease,
    interval: r.interval,
    lapses: r.lapses,
    lastAt: new Date(r.lastAt || Date.now()),
  }));

  await prisma.$transaction([
    prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        onboarded: state.onboarded,
        selectedCertIds: encode(state.selectedCertIds),
        activeCertId: state.activeCertId,
        streakCount: state.streak.count,
        streakBest: state.streak.best,
        streakLast: state.streak.lastActive,
        settings: encode(state.settings),
      },
      update: {
        onboarded: state.onboarded,
        selectedCertIds: encode(state.selectedCertIds),
        activeCertId: state.activeCertId,
        streakCount: state.streak.count,
        streakBest: state.streak.best,
        streakLast: state.streak.lastActive,
        settings: encode(state.settings),
      },
    }),

    prisma.attempt.deleteMany({ where: { userId } }),
    ...attempts.map((a) => prisma.attempt.create({ data: a })),

    prisma.plan.deleteMany({ where: { userId } }),
    ...plans.map((p) => prisma.plan.create({ data: p })),

    prisma.chatMessage.deleteMany({ where: { userId } }),
    ...messages.map((m) => prisma.chatMessage.create({ data: m })),

    prisma.customCard.deleteMany({ where: { userId } }),
    ...cards.map((c) => prisma.customCard.create({ data: c })),

    prisma.bookmark.deleteMany({ where: { userId } }),
    ...state.bookmarks.map((questionId) =>
      prisma.bookmark.create({ data: { userId, questionId } }),
    ),

    ...reviews.map((r) =>
      prisma.review.upsert({
        where: { userId_cardId: { userId, cardId: r.cardId } },
        create: r,
        update: {
          reps: r.reps,
          dueAt: r.dueAt,
          ease: r.ease,
          interval: r.interval,
          lapses: r.lapses,
          lastAt: r.lastAt,
        },
      }),
    ),
  ]);
}

/* -------------------------------------------------------------------------
 * Read
 * ---------------------------------------------------------------------- */

/** Rebuild the client state from the database. */
export async function loadState(userId: string): Promise<SyncableState> {
  const [profile, attempts, reviews, plans, messages, cards, bookmarks] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.attempt.findMany({ where: { userId }, orderBy: { startedAt: "asc" } }),
    prisma.review.findMany({ where: { userId } }),
    prisma.plan.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.chatMessage.findMany({ where: { userId }, orderBy: { at: "asc" } }),
    prisma.customCard.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.bookmark.findMany({ where: { userId } }),
  ]);

  const chatByCert: Record<string, ChatMessage[]> = {};
  messages.forEach((m) => {
    (chatByCert[m.certId] ??= []).push({
      id: m.id,
      role: m.role as ChatMessage["role"],
      content: m.content,
      at: m.at.getTime(),
      mode: (m.mode ?? undefined) as ChatMessage["mode"],
    });
  });

  const reviewMap: Record<string, ReviewState> = {};
  reviews.forEach((r) => {
    reviewMap[r.cardId] = {
      reps: r.reps,
      dueAt: r.dueAt.getTime(),
      ease: r.ease,
      interval: r.interval,
      lapses: r.lapses,
      lastAt: r.lastAt.getTime(),
    };
  });

  return {
    onboarded: profile?.onboarded ?? false,
    selectedCertIds: decode<string[]>(profile?.selectedCertIds, []),
    activeCertId: profile?.activeCertId ?? null,
    pastAttempts: attempts.map((a) => ({
      id: a.id,
      certId: a.certId,
      mode: a.mode as Attempt["mode"],
      domainIds: decode<string[]>(a.domainIds, []),
      questionIds: decode<string[]>(a.questionIds, []),
      answers: decode<Attempt["answers"]>(a.answers, []),
      startedAt: a.startedAt.getTime(),
      finishedAt: a.finishedAt ? a.finishedAt.getTime() : undefined,
    })),
    reviews: reviewMap,
    plans: plans.map((p) => ({
      id: p.id,
      certId: p.certId,
      examDate: p.examDate,
      hoursPerWeek: p.hoursPerWeek,
      weakDomains: decode<string[]>(p.weakDomains, []),
      tasks: decode<Plan["tasks"]>(p.tasks, []),
      createdAt: p.createdAt.getTime(),
    })),
    chatByCert,
    bookmarks: bookmarks.map((b) => b.questionId),
    customCards: cards.map((c) => ({
      id: c.id,
      certId: c.certId,
      domainId: "custom",
      kind: "term" as const,
      front: c.front,
      back: c.back,
    })),
    streak: {
      count: profile?.streakCount ?? DEFAULT_STREAK.count,
      best: profile?.streakBest ?? DEFAULT_STREAK.best,
      lastActive: profile?.streakLast ?? DEFAULT_STREAK.lastActive,
    },
    settings: decodeWithDefaults<Settings>(profile?.settings, DEFAULT_SETTINGS),
  };
}
