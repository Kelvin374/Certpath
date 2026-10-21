import type {
  Bundle,
  Difficulty,
  Flashcard,
  FlashcardKind,
  Question,
  QuestionOption,
  QuestionType,
  Vendor,
} from "./types";

/**
 * Vendors CertPath covers. We deliberately store an accent colour only —
 * no vendor logos are used anywhere in the product.
 */
export const VENDORS: Record<string, Vendor> = {
  microsoft: { id: "microsoft", name: "Microsoft", accent: "hsl(205 90% 55%)" },
  aws: { id: "aws", name: "AWS", accent: "hsl(38 92% 55%)" },
  comptia: { id: "comptia", name: "CompTIA", accent: "hsl(0 72% 52%)" },
  cisco: { id: "cisco", name: "Cisco", accent: "hsl(152 60% 42%)" },
  google: { id: "google", name: "Google", accent: "hsl(45 95% 53%)" },
  isc2: { id: "isc2", name: "ISC2", accent: "hsl(255 80% 65%)" },
  pmi: { id: "pmi", name: "PMI", accent: "hsl(220 75% 58%)" },
  linux: { id: "linux", name: "Linux Foundation", accent: "hsl(15 80% 50%)" },
  vmware: { id: "vmware", name: "VMware", accent: "hsl(190 70% 45%)" },
  vendor: { id: "vendor", name: "Vendor-neutral", accent: "hsl(165 84% 39%)" },
};

export const VENDOR_LIST: Vendor[] = Object.values(VENDORS);

/* -------------------------------------------------------------------------
 * Question factory
 * ---------------------------------------------------------------------- */

type OptionInput = string | { text: string; why?: string };

/**
 * Compact authoring helper for question banks.
 *
 * ```ts
 * q("d1", "single", 2, "Which statement is true?", ["a", "b", "c"], ["b"], "Microsoft Learn")
 * q("d1", "multi", 3, "Select all that apply", { a: "…", b: "…" }, ["a", "c"], "Microsoft Learn")
 * ```
 *
 * Option ids are auto-assigned `a`, `b`, `c`… when a plain array is supplied.
 * Per-option explanations are optional — a sensible default is generated so
 * every option always has a `why`.
 */
export function q(
  domainId: string,
  type: QuestionType,
  difficulty: Difficulty,
  prompt: string,
  correct: string[],
  options: OptionInput[] | Record<string, OptionInput>,
  reference: string,
  scenario?: string,
): Omit<Question, "id" | "certId"> {
  const entries: [string, OptionInput][] = Array.isArray(options)
    ? options.map((o, i) => [String.fromCharCode(97 + i), o] as [string, OptionInput])
    : Object.entries(options as Record<string, OptionInput>);

  const built: QuestionOption[] = entries.map(([id, raw]) => {
    const text = typeof raw === "string" ? raw : raw.text;
    const why =
      typeof raw === "string"
        ? correct.includes(id)
          ? "Correct — this matches the official guidance for the domain."
          : "Not correct — this describes a different concept or an invalid configuration."
        : raw.why ??
        (correct.includes(id)
          ? "Correct — this matches the official guidance for the domain."
          : "Not correct — this describes a different concept or an invalid configuration.");
    return { id, text, why };
  });

  const missing = correct.filter((c) => !built.some((o) => o.id === c));
  if (missing.length) {
    throw new Error(`Question "${prompt}" references unknown option id(s): ${missing.join(", ")}`);
  }

  return {
    domainId,
    type,
    difficulty,
    prompt,
    ...(scenario ? { scenario } : {}),
    options: built,
    correct,
    reference,
  };
}

/* -------------------------------------------------------------------------
 * Flashcard factory
 * ---------------------------------------------------------------------- */

/**
 * Compact authoring helper for flashcard decks.
 *
 * ```ts
 * cards("d1", "term", [["IaaS", "Infrastructure as a Service"], …])
 * ```
 */
export function cards(
  domainId: string,
  kind: FlashcardKind,
  entries: [string, string][],
): Omit<Flashcard, "id" | "certId">[] {
  return entries.map(([front, back]) => ({ domainId, kind, front, back }));
}

/* -------------------------------------------------------------------------
 * Bundle assembly
 * ---------------------------------------------------------------------- */

/**
 * Turns the compact factories into a fully identified bundle: stable ids are
 * derived from the exam id plus a slug of the prompt/front so ids stay the
 * same across edits and can be used as foreign keys in the database.
 */
export function buildBundle(
  cert: Bundle["cert"],
  questions: Omit<Question, "id" | "certId">[],
  flashcards: Omit<Flashcard, "id" | "certId">[],
): Bundle {
  const seen = new Map<string, number>();

  const withIds = questions.map((question) => {
    const slug = slugify(question.prompt).slice(0, 48);
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    return {
      ...question,
      id: `${cert.id}-q-${slug}${n > 1 ? `-${n}` : ""}`,
      certId: cert.id,
    } satisfies Question;
  });

  const cardSeen = new Map<string, number>();
  const cardsWithIds = flashcards.map((card) => {
    const slug = slugify(card.front).slice(0, 48);
    const n = (cardSeen.get(slug) ?? 0) + 1;
    cardSeen.set(slug, n);
    return {
      ...card,
      id: `${cert.id}-c-${slug}${n > 1 ? `-${n}` : ""}`,
      certId: cert.id,
    } satisfies Flashcard;
  });

  return {
    cert: { ...cert, bankReady: questions.length > 0 },
    questions: withIds,
    flashcards: cardsWithIds,
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
