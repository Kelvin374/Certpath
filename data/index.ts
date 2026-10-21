import { CATALOG } from "./catalog";
import { buildBundle } from "./factories";
import type { Certification, Flashcard, Question } from "./types";

import * as az900 from "./certs/az-900";
import * as awsClf from "./certs/aws-clf";
import * as securityPlus from "./certs/security-plus";
import * as ccna from "./certs/ccna";

/* -------------------------------------------------------------------------
 * Seeded banks
 * ---------------------------------------------------------------------- */

/**
 * Every exam that ships with original questions and flashcards.
 * Adding a new seeded exam is a one-line change here — see README.
 */
const SEEDED = [
  { cert: az900.cert, questions: az900.questions, flashcards: az900.flashcards },
  { cert: awsClf.cert, questions: awsClf.questions, flashcards: awsClf.flashcards },
  { cert: securityPlus.cert, questions: securityPlus.questions, flashcards: securityPlus.flashcards },
  { cert: ccna.cert, questions: ccna.questions, flashcards: ccna.flashcards },
];

const bundles = SEEDED.map((seed) => buildBundle(seed.cert, seed.questions, seed.flashcards));

/* -------------------------------------------------------------------------
 * Merged catalog
 * ---------------------------------------------------------------------- */

/** Seeded exams first (they have banks), then the metadata-only catalog. */
export const CERTIFICATIONS: Certification[] = [
  ...bundles.map((b) => b.cert),
  ...CATALOG.filter((c) => !bundles.some((b) => b.cert.id === c.id)),
];

export const CERT_BY_ID: Record<string, Certification> = Object.fromEntries(
  CERTIFICATIONS.map((c) => [c.id, c]),
);

export const CERT_IDS: string[] = CERTIFICATIONS.map((c) => c.id);

export const QUESTIONS: Question[] = bundles.flatMap((b) => b.questions);

export const FLASHCARDS: Flashcard[] = bundles.flatMap((b) => b.flashcards);

export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(
  QUESTIONS.map((q) => [q.id, q]),
);

export const FLASHCARD_BY_ID: Record<string, Flashcard> = Object.fromEntries(
  FLASHCARDS.map((c) => [c.id, c]),
);

/** Ids of exams that ship with a full original question bank + deck. */
export const BANK_READY_IDS: string[] = bundles.map((b) => b.cert.id);

/* -------------------------------------------------------------------------
 * Lookups
 * ---------------------------------------------------------------------- */

export function questionsFor(certId: string): Question[] {
  return QUESTIONS.filter((q) => q.certId === certId);
}

export function cardsFor(certId: string): Flashcard[] {
  return FLASHCARDS.filter((c) => c.certId === certId);
}

export function certFor(certId: string | null | undefined): Certification | undefined {
  return certId ? CERT_BY_ID[certId] : undefined;
}

/** The exam used when a learner has not chosen one yet. */
export const DEFAULT_CERT_ID = "az-900";

export function defaultCert(): Certification {
  return CERT_BY_ID[DEFAULT_CERT_ID] ?? CERTIFICATIONS[0];
}

/** Per-domain question counts for a given exam — used by the planner + catalog. */
export function domainStats(certId: string): { domainId: string; count: number }[] {
  const cert = CERT_BY_ID[certId];
  if (!cert) return [];
  return cert.domains.map((d) => ({
    domainId: d.id,
    count: QUESTIONS.filter((q) => q.certId === certId && q.domainId === d.id).length,
  }));
}

export const CONTENT_STATS = {
  exams: CERTIFICATIONS.length,
  banks: BANK_READY_IDS.length,
  questions: QUESTIONS.length,
  flashcards: FLASHCARDS.length,
};
