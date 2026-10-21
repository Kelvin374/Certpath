import type { Flashcard } from "@/data/types";

/* -------------------------------------------------------------------------
 * Attempt / quiz
 * ---------------------------------------------------------------------- */

export type AttemptMode = "practice" | "exam";

export interface AnswerRecord {
  /** Option ids the learner selected. */
  picked: string[];
  /** Whether the selection was correct, recorded at submit time. */
  correct: boolean;
  /** Learner flagged the question for review. */
  flagged?: boolean;
  /** Epoch millis the answer was submitted. */
  at: number;
}

export interface Attempt {
  id: string;
  certId: string;
  mode: AttemptMode;
  /** Domains covered by this attempt (all domains when unrestricted). */
  domainIds: string[];
  /** Question ids, in the order they were served. */
  questionIds: string[];
  /** Answers, index-aligned with `questionIds`. */
  answers: AnswerRecord[];
  startedAt: number;
  finishedAt?: number;
}

/* -------------------------------------------------------------------------
 * Spaced repetition
 * ---------------------------------------------------------------------- */

export type Rating = "again" | "hard" | "good" | "easy";

export interface ReviewState {
  /** Successful repetitions. */
  reps: number;
  /** Epoch millis the card becomes due again. */
  dueAt: number;
  /** Ease factor, mirroring the SM-2 algorithm. */
  ease: number;
  /** Current interval in days. */
  interval: number;
  /** Times the card was forgotten. */
  lapses: number;
  lastAt: number;
}

/* -------------------------------------------------------------------------
 * Planner
 * ---------------------------------------------------------------------- */

export type TaskKind = "quiz" | "cards" | "read" | "review" | "mock" | "break";

export interface PlanTask {
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  label: string;
  minutes: number;
  done: boolean;
  domainId?: string;
  kind: TaskKind;
}

export interface Plan {
  id: string;
  certId: string;
  /** ISO date of the target exam, `YYYY-MM-DD`. */
  examDate: string;
  hoursPerWeek: number;
  /** Domains the learner wants extra emphasis on. */
  weakDomains: string[];
  tasks: PlanTask[];
  createdAt: number;
}

/* -------------------------------------------------------------------------
 * Study buddy
 * ---------------------------------------------------------------------- */

export type BuddyMode = "explain" | "analogy" | "compare" | "quiz" | "tip";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  at: number;
  mode?: BuddyMode;
}

/* -------------------------------------------------------------------------
 * Misc
 * ---------------------------------------------------------------------- */

export interface Streak {
  count: number;
  best: number;
  /** ISO date of the last day the user was active, `YYYY-MM-DD`. */
  lastActive: string;
}

export interface Settings {
  /** Target number of study minutes per day. */
  dailyGoal: number;
  theme: "dark" | "light";
}

export interface AppState {
  /** Has the learner completed the initial exam selection? */
  onboarded: boolean;
  selectedCertIds: string[];
  activeCertId: string | null;
  /** The attempt currently in progress, if any. */
  attempt: Attempt | null;
  pastAttempts: Attempt[];
  reviews: Record<string, ReviewState>;
  plans: Plan[];
  chatByCert: Record<string, ChatMessage[]>;
  bookmarks: string[];
  customCards: Flashcard[];
  streak: Streak;
  settings: Settings;
}
