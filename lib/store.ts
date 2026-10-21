"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

import { QUESTION_BY_ID } from "@/data";
import type { Flashcard } from "@/data/types";
import { isCorrect, todayISO, uid } from "./utils";
import type {
  AppState,
  Attempt,
  ChatMessage,
  Plan,
  Rating,
  ReviewState,
  Settings,
  Streak,
} from "./types";

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

const STORAGE_KEY = "certpath.v1";

const DEFAULT_STATE: AppState = {
  onboarded: false,
  selectedCertIds: [],
  activeCertId: null,
  attempt: null,
  pastAttempts: [],
  reviews: {},
  plans: [],
  chatByCert: {},
  bookmarks: [],
  customCards: [],
  streak: { count: 0, best: 0, lastActive: "" },
  settings: { dailyGoal: 45, theme: "dark" },
};

/** Minutes before a forgotten card comes back around. */
const RELEARN_DELAY_MS = 10 * 60 * 1000;

/* -------------------------------------------------------------------------
 * Storage
 * ---------------------------------------------------------------------- */

/** Fallback used when the browser refuses persistent storage. */
const memoryStore = new Map<string, string>();

/**
 * A storage adapter that never throws.
 *
 * `localStorage` can be unavailable entirely (server rendering, Node tests)
 * or fail mid-session (private browsing quota, disabled site data). A bare
 * `createJSONStorage(() => localStorage)` would throw inside the persist
 * middleware and take the whole app down, so every access is guarded and
 * falls back to an in-memory map.
 */
function safeStorage(): StateStorage {
  let ls: Storage | null = null;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const probe = "__certpath_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      ls = window.localStorage;
    }
  } catch {
    ls = null;
  }

  return {
    getItem: (name) => {
      try {
        if (ls) return ls.getItem(name);
      } catch {
        /* fall through to memory */
      }
      return memoryStore.get(name) ?? null;
    },
    setItem: (name, value) => {
      try {
        if (ls) {
          ls.setItem(name, value);
          return;
        }
      } catch {
        /* fall through to memory */
      }
      memoryStore.set(name, value);
    },
    removeItem: (name) => {
      try {
        ls?.removeItem(name);
      } catch {
        /* ignore */
      }
      memoryStore.delete(name);
    },
  };
}

/* -------------------------------------------------------------------------
 * Actions
 * ---------------------------------------------------------------------- */

export interface AppActions {
  /* onboarding & exam selection */
  onboard: (certIds: string[]) => void;
  setActiveCert: (certId: string) => void;
  toggleSelectedCert: (certId: string) => void;
  removeSelectedCert: (certId: string) => void;

  /* quiz */
  startAttempt: (attempt: Attempt) => void;
  answer: (index: number, picked: string[], flagged: boolean) => void;
  finishAttempt: () => void;
  abandonAttempt: () => void;
  toggleBookmark: (questionId: string) => void;

  /* flashcards */
  rateCard: (cardId: string, rating: Rating) => void;
  addCustomCard: (card: {
    id?: string;
    certId: string;
    domainId?: string;
    kind?: Flashcard["kind"];
    front: string;
    back: string;
  }) => void;
  removeCustomCard: (cardId: string) => void;

  /* planner */
  upsertPlan: (plan: Plan) => void;
  deletePlan: (planId: string) => void;
  toggleTask: (planId: string, taskId: string) => void;

  /* chat */
  appendChat: (certId: string, message: ChatMessage) => void;
  clearChat: (certId: string) => void;

  /* misc */
  touchStreak: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  /** Replace local state with the server copy (after sign-in / on first sync). */
  hydrate: (state: Partial<AppState>) => void;
  resetAll: () => void;
}

export type AppStore = AppState & AppActions;

/* -------------------------------------------------------------------------
 * SRS helpers
 * ---------------------------------------------------------------------- */

const DEFAULT_REVIEW: ReviewState = {
  reps: 0,
  dueAt: 0,
  ease: 2.5,
  interval: 0,
  lapses: 0,
  lastAt: 0,
};

/**
 * SM-2 style scheduling.
 *
 * `again` brings the card back in minutes; `easy` stretches the interval the
 * furthest. Mastery in the UI is `reps >= 2`.
 *
 * Exported so the scheduler can be unit-tested independently of the store.
 */
export function computeNextReview(previous: ReviewState | undefined, rating: Rating): ReviewState {
  const prev = previous ?? DEFAULT_REVIEW;
  const now = Date.now();
  const day = 86_400_000;

  switch (rating) {
    case "again":
      return {
        ...prev,
        reps: 0,
        lapses: prev.lapses + 1,
        ease: Math.max(1.3, prev.ease - 0.2),
        interval: 0,
        dueAt: now + RELEARN_DELAY_MS,
        lastAt: now,
      };
    case "hard":
      return {
        ...prev,
        reps: prev.reps + 1,
        ease: Math.max(1.3, prev.ease - 0.15),
        interval: Math.max(1, prev.interval * 1.2),
        dueAt: now + Math.max(1, prev.interval * 1.2) * day,
        lastAt: now,
      };
    case "good": {
      // SM-2 progression: 1 day, then 3 days, then interval x ease.
      const interval =
        prev.reps === 0 ? 1 : prev.reps === 1 ? 3 : Math.max(1, prev.interval * prev.ease);
      return { ...prev, reps: prev.reps + 1, interval, dueAt: now + interval * day, lastAt: now };
    }
    case "easy": {
      const interval =
        prev.reps === 0 ? 4 : prev.reps === 1 ? 8 : Math.max(2, prev.interval * prev.ease * 1.3);
      return {
        ...prev,
        reps: prev.reps + 1,
        ease: Math.min(3.2, prev.ease + 0.15),
        interval,
        dueAt: now + interval * day,
        lastAt: now,
      };
    }
  }
}

/* -------------------------------------------------------------------------
 * Store
 * ---------------------------------------------------------------------- */

export const useApp = create<AppStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      /* ── onboarding & exam selection ───────────────────────────── */
      onboard: (certIds) =>
        set((s) => ({
          onboarded: true,
          selectedCertIds: certIds.length ? certIds : s.selectedCertIds,
          activeCertId: s.activeCertId ?? certIds[0] ?? null,
        })),

      setActiveCert: (certId) => set({ activeCertId: certId }),

      toggleSelectedCert: (certId) =>
        set((s) => {
          const has = s.selectedCertIds.includes(certId);
          const selectedCertIds = has
            ? s.selectedCertIds.filter((id) => id !== certId)
            : [...s.selectedCertIds, certId];
          return {
            selectedCertIds,
            activeCertId: has && s.activeCertId === certId ? selectedCertIds[0] ?? null : s.activeCertId,
          };
        }),

      removeSelectedCert: (certId) =>
        set((s) => {
          const selectedCertIds = s.selectedCertIds.filter((id) => id !== certId);
          return {
            selectedCertIds,
            activeCertId: s.activeCertId === certId ? selectedCertIds[0] ?? null : s.activeCertId,
          };
        }),

      /* ── quiz ───────────────────────────────────────────────────── */
      startAttempt: (attempt) => set({ attempt }),

      answer: (index, picked, flagged) =>
        set((s) => {
          if (!s.attempt) return s;
          const question = QUESTION_BY_ID[s.attempt.questionIds[index]];
          const answers = s.attempt.answers.slice();
          answers[index] = {
            picked,
            correct: question ? isCorrect(question, picked) : false,
            flagged,
            at: Date.now(),
          };
          return { attempt: { ...s.attempt, answers } };
        }),

      finishAttempt: () =>
        set((s) => {
          if (!s.attempt) return s;
          const finished = { ...s.attempt, finishedAt: Date.now() };
          return {
            attempt: null,
            pastAttempts: [...s.pastAttempts, finished],
          };
        }),

      abandonAttempt: () => set({ attempt: null }),

      toggleBookmark: (questionId) =>
        set((s) => ({
          bookmarks: s.bookmarks.includes(questionId)
            ? s.bookmarks.filter((id) => id !== questionId)
            : [...s.bookmarks, questionId],
        })),

      /* ── flashcards ─────────────────────────────────────────────── */
      rateCard: (cardId, rating) =>
        set((s) => ({
          reviews: { ...s.reviews, [cardId]: computeNextReview(s.reviews[cardId], rating) },
        })),

      addCustomCard: (card) =>
        set((s) => ({
          customCards: [
            ...s.customCards,
            {
              id: card.id ?? uid("user-card"),
              certId: card.certId,
              domainId: card.domainId ?? "custom",
              kind: card.kind ?? "term",
              front: card.front,
              back: card.back,
            },
          ],
        })),

      removeCustomCard: (cardId) =>
        set((s) => ({ customCards: s.customCards.filter((c) => c.id !== cardId) })),

      /* ── planner ────────────────────────────────────────────────── */
      upsertPlan: (plan) =>
        set((s) => {
          const exists = s.plans.some((p) => p.id === plan.id);
          return {
            plans: exists
              ? s.plans.map((p) => (p.id === plan.id ? plan : p))
              : [...s.plans, plan],
          };
        }),

      deletePlan: (planId) => set((s) => ({ plans: s.plans.filter((p) => p.id !== planId) })),

      toggleTask: (planId, taskId) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id === planId
              ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) }
              : p,
          ),
        })),

      /* ── chat ───────────────────────────────────────────────────── */
      appendChat: (certId, message) =>
        set((s) => ({
          chatByCert: {
            ...s.chatByCert,
            [certId]: [...(s.chatByCert[certId] ?? []), message],
          },
        })),

      clearChat: (certId) =>
        set((s) => ({ chatByCert: { ...s.chatByCert, [certId]: [] } })),

      /* ── misc ───────────────────────────────────────────────────── */
      touchStreak: () =>
        set((s) => {
          const today = todayISO();
          if (s.streak.lastActive === today) return s;

          const yesterday = todayISO(new Date(Date.now() - 86_400_000));
          const count = s.streak.lastActive === yesterday ? s.streak.count + 1 : 1;
          const streak: Streak = {
            count,
            best: Math.max(s.streak.best, count),
            lastActive: today,
          };
          return { streak };
        }),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      /**
       * Replace local state with the server copy (after sign-in / on first
       * sync). Nested objects are merged rather than replaced so a partial
       * server payload cannot strip fields the client relies on.
       */
      hydrate: (state) =>
        set((s) => ({
          ...s,
          ...state,
          settings: { ...s.settings, ...(state.settings ?? {}) },
          streak: { ...s.streak, ...(state.streak ?? {}) },
        })),

      resetAll: () => set({ ...DEFAULT_STATE }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage()),
      version: 1,
      // Rehydrate manually so the server-rendered HTML and the client store
      // never disagree.
      skipHydration: true,
      partialize: (state) => ({
        onboarded: state.onboarded,
        selectedCertIds: state.selectedCertIds,
        activeCertId: state.activeCertId,
        attempt: state.attempt,
        pastAttempts: state.pastAttempts,
        reviews: state.reviews,
        plans: state.plans,
        chatByCert: state.chatByCert,
        bookmarks: state.bookmarks,
        customCards: state.customCards,
        streak: state.streak,
        settings: state.settings,
      }),
    },
  ),
);

/** Durable state that gets mirrored to the account. */
export function syncableState(state: AppStore) {
  return {
    onboarded: state.onboarded,
    selectedCertIds: state.selectedCertIds,
    activeCertId: state.activeCertId,
    pastAttempts: state.pastAttempts,
    reviews: state.reviews,
    plans: state.plans,
    chatByCert: state.chatByCert,
    bookmarks: state.bookmarks,
    customCards: state.customCards,
    streak: state.streak,
    settings: state.settings,
  };
}

export type SyncableState = ReturnType<typeof syncableState>;
