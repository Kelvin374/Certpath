/**
 * Core domain model for CertPath.
 *
 * These types describe the *static* content (exam metadata, question banks,
 * flashcards). User-generated state (attempts, plans, reviews) lives in
 * `lib/types.ts` because it is persisted rather than versioned with the code.
 */

export type Difficulty = 1 | 2 | 3;

export type QuestionType = "single" | "multi" | "scenario";

export type FlashcardKind = "term" | "service" | "port" | "command" | "framework" | "acronym";

export type ScoreScale = "percent" | "scaled";

export interface Vendor {
  id: string;
  name: string;
  /** CSS colour used for charts and accents. Never a vendor logo. */
  accent: string;
}

export interface Domain {
  id: string;
  name: string;
  /** Percentage of the exam devoted to this domain (0–100). */
  weight: number;
}

export interface Certification {
  id: string;
  /** Key into `VENDORS`. */
  vendor: string;
  /** Vendor's official exam code, e.g. "AZ-900". */
  examCode: string;
  /** Human-readable exam name. */
  name: string;
  /** One-paragraph summary shown in the catalog. */
  description: string;
  /** Beginner | Associate | Professional | Expert */
  level: string;
  durationMin: number;
  questionCount: number;
  /** Passing score expressed in `scoreScale` units. */
  passingScore: number;
  scoreScale: ScoreScale;
  /** Link to the vendor's official exam page (opens in a new tab). */
  officialExamUrl: string;
  domains: Domain[];
  /** Ordered ids of exams that typically come before this one. */
  nextSteps: string[];
  /** Set when the exam ships with a full question bank + flashcard deck. */
  bankReady?: boolean;
}

export interface QuestionOption {
  id: string;
  text: string;
  /** Why this option is right or wrong — shown after the learner answers. */
  why: string;
}

export interface Question {
  id: string;
  certId: string;
  domainId: string;
  type: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  /** Optional context paragraph for scenario questions. */
  scenario?: string;
  options: QuestionOption[];
  /** Ids of the correct option(s). */
  correct: string[];
  /** Where a learner can verify the concept (docs, standards, RFCs…). */
  reference: string;
}

export interface Flashcard {
  id: string;
  certId: string;
  domainId: string;
  kind: FlashcardKind;
  front: string;
  back: string;
}

/** A seed file exports exactly this shape. */
export interface Bundle {
  cert: Certification;
  questions: Question[];
  flashcards: Flashcard[];
}
