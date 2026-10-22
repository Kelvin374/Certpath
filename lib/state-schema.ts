import { z } from "zod";

import { LANGUAGE_CODES } from "./i18n";

/**
 * The contract for the account's stored study state.
 *
 * Shared by the API route and the test suite so the wire format is verified
 * in one place. Every nested object carries defaults: a partial payload must
 * never be rejected outright, because that would strand the learner's data
 * in the browser with no way to push it back up.
 */

export const reviewSchema = z.object({
  reps: z.number().default(0),
  dueAt: z.number().default(0),
  ease: z.number().default(2.5),
  interval: z.number().default(0),
  lapses: z.number().default(0),
  lastAt: z.number().default(0),
});

export const attemptSchema = z.object({
  id: z.string(),
  certId: z.string(),
  mode: z.enum(["practice", "exam"]),
  domainIds: z.array(z.string()).default([]),
  questionIds: z.array(z.string()).default([]),
  answers: z
    .array(
      z.object({
        picked: z.array(z.string()).default([]),
        correct: z.boolean().default(false),
        flagged: z.boolean().optional(),
        at: z.number().default(0),
      }),
    )
    .default([]),
  startedAt: z.number().default(0),
  finishedAt: z.number().optional(),
});

export const planSchema = z.object({
  id: z.string(),
  certId: z.string(),
  examDate: z.string(),
  hoursPerWeek: z.number().default(0),
  weakDomains: z.array(z.string()).default([]),
  tasks: z
    .array(
      z.object({
        id: z.string(),
        date: z.string(),
        label: z.string(),
        minutes: z.number().default(0),
        done: z.boolean().default(false),
        domainId: z.string().optional(),
        kind: z.enum(["quiz", "cards", "read", "review", "mock", "break"]),
      }),
    )
    .default([]),
  createdAt: z.number().default(0),
});

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  at: z.number().default(0),
  mode: z.enum(["explain", "analogy", "compare", "quiz", "tip"]).optional(),
});

export const customCardSchema = z.object({
  id: z.string(),
  certId: z.string(),
  domainId: z.string().default("custom"),
  kind: z.enum(["term", "service", "port", "command", "framework", "acronym"]).default("term"),
  front: z.string(),
  back: z.string(),
});

export const stateSchema = z.object({
  onboarded: z.boolean().default(false),
  selectedCertIds: z.array(z.string()).default([]),
  activeCertId: z.string().nullable().default(null),
  pastAttempts: z.array(attemptSchema).default([]),
  reviews: z.record(z.string(), reviewSchema).default({}),
  plans: z.array(planSchema).default([]),
  chatByCert: z.record(z.string(), z.array(chatMessageSchema)).default({}),
  bookmarks: z.array(z.string()).default([]),
  customCards: z.array(customCardSchema).default([]),
  streak: z
    .object({
      count: z.number().default(0),
      best: z.number().default(0),
      lastActive: z.string().default(""),
    })
    .default({ count: 0, best: 0, lastActive: "" }),
  settings: z
    .object({
      dailyGoal: z.number().default(45),
      theme: z.enum(["dark", "light"]).default("dark"),
      language: z.enum(LANGUAGE_CODES).default("en"),
    })
    .default({ dailyGoal: 45, theme: "dark", language: "en" }),
});

export type ParsedState = z.infer<typeof stateSchema>;
