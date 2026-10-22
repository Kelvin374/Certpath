import { CERT_BY_ID, cardsFor, questionsFor } from "@/data";
import type { Flashcard, Question } from "@/data/types";
import { translate, type LanguageCode } from "./i18n";
import type { BuddyMode } from "./types";

/**
 * CertPath Study Buddy.
 *
 * The buddy answers from CertPath's own original content bank — the same
 * questions and flashcards a learner practises with — so it never invents
 * vendor-specific facts and never requires a network call.
 *
 * `askBuddy` is an interface, not an implementation detail: swapping in a
 * remote LLM later means providing another function with this signature.
 */

export interface AskBuddyInput {
  certId: string;
  mode: BuddyMode;
  /** The learner's message. */
  topic: string;
}

export interface AskBuddyResult {
  content: string;
  /** Where the answer came from — a flashcard, a question, or the exam outline. */
  source?: "flashcard" | "question" | "outline" | "tip";
  /** Related flashcard ids, for "more like this" affordances. */
  relatedCardIds?: string[];
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "is", "are", "was", "were",
  "be", "it", "this", "that", "with", "as", "at", "by", "from", "me", "my", "i", "you",
  "can", "explain", "tell", "about", "what", "why", "how", "does", "do", "difference",
  "compare", "give", "analogy", "quiz", "me", "tip", "like", "i'm", "im", "beginner",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\-\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function scoreText(haystack: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  const lower = haystack.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lower.includes(token)) score += token.length > 4 ? 2 : 1;
  }
  return score;
}

interface Ranked<T> {
  item: T;
  score: number;
}

function rank<T>(items: T[], tokens: string[], getText: (item: T) => string): Ranked<T>[] {
  return items
    .map((item) => ({ item, score: scoreText(getText(item), tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/* -------------------------------------------------------------------------
 * Theme helpers
 * ---------------------------------------------------------------------- */

function themeFor(certId: string): keyof typeof THEMES {
  const cert = CERT_BY_ID[certId];
  switch (cert?.vendor) {
    case "comptia":
    case "isc2":
      return "security";
    case "cisco":
      return "networking";
    case "pmi":
      return "project";
    case "linux":
    case "vmware":
      return "systems";
    default:
      return "cloud";
  }
}

const THEMES = {
  cloud: {
    label: "cloud computing",
    analogy:
      "Picture a city that owns a power plant, a water treatment works and a road network. " +
      "The city owns the heavy infrastructure and rents you a metered slice of it. " +
      "Your unit may be a single flat, but it sits inside a shared, highly reliable system you did not have to build.",
    tip:
      "Anchor new cloud concepts to the shared responsibility line: ask yourself what the provider runs, " +
      "what the customer runs, and where the boundary sits for that specific service.",
  },
  security: {
    label: "security",
    analogy:
      "Picture a physical office building. The walls, fire doors, alarm system and guard desk are the " +
      "'provider' layer. Inside it, the badge rules, desk keys, locked drawers and who you let in are " +
      "your 'customer' layer. A break-in at the loading bay is the provider's problem; a badge left on a desk is yours.",
    tip:
      "For every control, name the asset it protects, the threat it stops, and where it belongs in " +
      "prevent / detect / respond. That three-way classification answers most situational questions.",
  },
  networking: {
    label: "networking",
    analogy:
      "Picture a postal system. An IP address is the address on an envelope, a subnet is a neighbourhood, " +
      "a router is the sorting office that decides which postcode region to forward to, and a default route " +
      "is the 'if you do not know, send it to the main office' instruction.",
    tip:
      "Whenever a scenario gives you symptoms, start at Layer 1 and work up — link, then addressing, " +
      "then routing, then the application. Half of all network questions are answered before Layer 3.",
  },
  systems: {
    label: "systems administration",
    analogy:
      "Picture an on-call engineer working a shift. Monitoring is the dashboard, runbooks are the printed " +
      "procedure, automation is the script that handles the routine alerts, and the escalation path is the " +
      "handover to the next shift.",
    tip:
      "Learn the command's flags as pairs — what to show versus what to change. Exam scenarios describe a " +
      "symptom and expect one specific command that inspects it.",
  },
  project: {
    label: "project management",
    analogy:
      "Picture a building project. The charter is the owner's brief, the schedule is the critical path, " +
      "the risk register is the site safety log, and the change control board is the planning committee " +
      "that approves deviations.",
    tip:
      "Answer process questions with the triad of scope, schedule and cost, then add quality. Most " +
      "situational questions hide a conflict between two of those constraints.",
  },
} as const;

/* -------------------------------------------------------------------------
 * Response builders
 * ---------------------------------------------------------------------- */

function domainNameFor(certId: string, domainId: string): string {
  return CERT_BY_ID[certId]?.domains.find((d) => d.id === domainId)?.name ?? domainId;
}

function flashcardLine(card: Flashcard): string {
  return `• ${card.front} — ${card.back}`;
}

function questionBlock(question: Question, withAnswer: boolean): string {
  const options = question.options.map((o) => `   ${o.id.toUpperCase()}) ${o.text}`).join("\n");
  const header = question.scenario ? `${question.scenario}\n\n${question.prompt}` : question.prompt;
  const answer = withAnswer
    ? `\n\nCorrect answer: ${question.correct.map((c) => c.toUpperCase()).join(", ")}\n` +
      question.options
        .filter((o) => question.correct.includes(o.id))
        .map((o) => `Why: ${o.why}`)
        .join("\n") +
      `\n\nReference: ${question.reference}`
    : `\n\nReply with just the letter — I'll explain the reasoning.`;
  return `${header}\n\n${options}${answer}`;
}

function outlineFallback(certId: string, topic: string): string {
  const cert = CERT_BY_ID[certId];
  if (!cert) {
    return "I could not find that exam in the catalog. Try picking an exam from the switcher.";
  }
  const lines = cert.domains.map((d) => `• ${d.name} (${d.weight}% of the exam)`).join("\n");
  return (
    `I do not have a note that covers "${topic}" for ${cert.examCode} yet.\n\n` +
    `Here is what ${cert.examCode} covers, so you can point me at the right area:\n${lines}\n\n` +
    `Try naming a term such as one of those domain topics, or ask me to quiz you on a domain.`
  );
}

/* -------------------------------------------------------------------------
 * Modes
 * ---------------------------------------------------------------------- */

function composeExplain(
  certId: string,
  topic: string,
  cards: Ranked<Flashcard>[],
  questions: Ranked<Question>[],
): AskBuddyResult {
  const cert = CERT_BY_ID[certId];
  const top = cards[0]?.item;
  const related = cards.slice(1, 4).map((c) => c.item);

  if (!top) {
    const fallback = outlineFallback(certId, topic);
    if (questions[0]) {
      return {
        content: `${fallback}\n\nHere is a practice question on the same exam that may help you pin it down:\n\n${questionBlock(questions[0].item, true)}`,
        source: "outline",
      };
    }
    return { content: fallback, source: "outline" };
  }

  const question = questions[0]?.item;
  const parts: string[] = [];

  parts.push(`${top.front}\n\n${top.back}`);
  parts.push(
    `**Where this lands on ${cert?.examCode ?? "the exam"}:** ${
      cert?.domains.find((d) => d.id === top.domainId)?.name ?? top.domainId
    }${
      question
        ? ` — and it shows up in questions like this one.`
        : `.`
    }`,
  );

  if (question) {
    parts.push(questionBlock(question, false));
  }

  if (related.length) {
    parts.push(`Related terms you should be able to define:\n${related.map(flashcardLine).join("\n")}`);
  }

  parts.push(
    `_(Original CertPath material. Independent study aid — not an official ${cert?.vendor ?? "vendor"} resource.)_`,
  );

  return {
    content: parts.join("\n\n"),
    source: "flashcard",
    relatedCardIds: [top.id, ...related.map((c) => c.id)],
  };
}

function composeAnalogy(
  certId: string,
  topic: string,
  cards: Ranked<Flashcard>[],
): AskBuddyResult {
  const cert = CERT_BY_ID[certId];
  const top = cards[0]?.item;
  const theme = THEMES[themeFor(certId)];

  if (!top) {
    return {
      content: `Let me anchor that in ${theme.label}.\n\n${theme.analogy}\n\n${outlineFallback(certId, topic)}`,
      source: "outline",
    };
  }

  return {
    content:
      `**${top.front}** — ${top.back}\n\n` +
      `**The analogy:**\n${theme.analogy}\n\n` +
      `Mapping it back: in this analogy "${top.front}" plays the part of the piece of the system that ` +
      `behaves the way the definition above describes — the mechanism is the same even though the setting differs.\n\n` +
      `**Where it appears on ${cert?.examCode ?? "the exam"}:** ${domainNameFor(certId, top.domainId)}.\n\n` +
      `_(Original CertPath material — an independent study aid.)_`,
    source: "flashcard",
    relatedCardIds: [top.id],
  };
}

function composeCompare(
  certId: string,
  topic: string,
  cards: Ranked<Flashcard>[],
  questions: Ranked<Question>[],
): AskBuddyResult {
  const cert = CERT_BY_ID[certId];
  // Try to split the topic into two candidate terms.
  const split = topic
    .split(/\s+(?:vs\.?|versus|and|or|compared?\s+to|with)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const wanted = split.slice(0, 2);
  const matched: Flashcard[] = [];

  for (const term of wanted) {
    const tokens = tokenize(term);
    const hit = rank(cardsFor(certId), tokens, (c) => `${c.front} ${c.back}`)[0]?.item;
    if (hit && !matched.some((m) => m.id === hit.id)) matched.push(hit);
  }
  // Fall back to the two best-scoring cards.
  if (matched.length < 2) {
    for (const r of cards) {
      if (matched.length >= 2) break;
      if (!matched.some((m) => m.id === r.item.id)) matched.push(r.item);
    }
  }

  if (matched.length < 2) {
    return {
      content:
        `I need two specific things to compare. Try naming them like "S3 vs Azure Blob" or "hot site vs cold site".\n\n` +
        outlineFallback(certId, topic),
      source: "outline",
    };
  }

  const [a, b] = matched;
  const sharedDomain = a.domainId === b.domainId;
  const question = questions[0]?.item;

  const lines = [
    `**${a.front}** vs **${b.front}**\n`,
    `• ${a.front} — ${a.back}`,
    `• ${b.front} — ${b.back}\n`,
    sharedDomain
      ? `Both sit in **${domainNameFor(certId, a.domainId)}**, which is why the exam likes to ask you to separate them.`
      : `They live in different domains: **${domainNameFor(certId, a.domainId)}** and **${domainNameFor(certId, b.domainId)}**.`,
    `**How to tell them apart on exam day:** look for the one distinguishing noun in each definition — ` +
      `the delivery mechanism, the scope of control, or the failure mode. Examiners rarely test the full ` +
      `definition, they test the single differentiator.`,
  ];

  if (question) {
    lines.push(`A practice question that separates them:\n\n${questionBlock(question, false)}`);
  }

  lines.push(
    `_(Original CertPath material. Independent study aid — not an official ${cert?.vendor ?? "vendor"} resource.)_`,
  );

  return {
    content: lines.join("\n\n"),
    source: "flashcard",
    relatedCardIds: [a.id, b.id],
  };
}

function composeQuiz(
  certId: string,
  topic: string,
  questions: Ranked<Question>[],
): AskBuddyResult {
  const cert = CERT_BY_ID[certId];
  const question = questions[0]?.item;

  if (!question) {
    const fallback = outlineFallback(certId, topic);
    return { content: `${fallback}\n\nPick a domain above and I will quiz you on it.`, source: "outline" };
  }

  return {
    content:
      `Here is one on **${domainNameFor(certId, question.domainId)}** ` +
      `(difficulty ${question.difficulty}/3, ${question.type}).\n\n` +
      questionBlock(question, true) +
      `\n\n_(Original CertPath material. Independent study aid.)_`,
    source: "question",
  };
}

function composeTip(
  certId: string,
  topic: string,
  cards: Ranked<Flashcard>[],
  questions: Ranked<Question>[],
): AskBuddyResult {
  const cert = CERT_BY_ID[certId];
  const theme = THEMES[themeFor(certId)];
  const top = cards[0]?.item;

  const tips: string[] = [];
  tips.push(theme.tip);

  if (cert) {
    const heaviest = cert.domains.slice().sort((x, y) => y.weight - x.weight)[0];
    tips.push(
      `**Weight your time.** "${heaviest.name}" is ${heaviest.weight}% of ${cert.examCode}. ` +
        `Studying it in proportion to its weight is the cheapest way to move your score.`,
    );
  }

  tips.push(
    `**Active recall beats re-reading.** Close the material and write what you remember, then check. ` +
      `Reading feels productive and builds almost nothing.`,
  );
  tips.push(
    `**Keep an error log.** Every question you get wrong goes in a list with the reason you got it wrong. ` +
      `Reviewing that list before each mock is worth more than another full practice set.`,
  );

  if (top) {
    tips.push(
      `**Anchor new terms to what you already know.** "${top.front}" is the concept to build around here: ${top.back}`,
    );
  }

  if (questions[0]) {
    tips.push(
      `**Time yourself.** ${cert?.examCode ?? "The exam"} runs ${cert?.durationMin ?? 90} minutes for ` +
        `${cert?.questionCount ?? 40} questions. Practise against that clock, not an unlimited one.`,
    );
  }

  tips.push(
    `_(Original CertPath material. Independent study aid — always book the official exam through the vendor.)_`,
  );

  return { content: tips.join("\n\n"), source: "tip" };
}

/* -------------------------------------------------------------------------
 * Entry point
 * ---------------------------------------------------------------------- */

export async function askBuddy(input: AskBuddyInput): Promise<AskBuddyResult> {
  const { certId, mode, topic } = input;
  const tokens = tokenize(topic);

  const allCards = cardsFor(certId);
  const allQuestions = questionsFor(certId);

  const cardRanks = rank(allCards, tokens, (c) => `${c.front} ${c.back}`);
  const questionRanks = rank(allQuestions, tokens, (q) => `${q.prompt} ${q.scenario ?? ""}`);

  // If the topic matched nothing, fall back to the weakest-referenced domain so
  // the answer is still specific to the exam rather than generic.
  let cards = cardRanks;
  let questions = questionRanks;

  if (!cards.length && !questions.length) {
    const cert = CERT_BY_ID[certId];
    const domain = cert?.domains[0];
    if (domain) {
      cards = rank(
        allCards.filter((c) => c.domainId === domain.id),
        tokenize(domain.name),
        (c) => `${c.front} ${c.back}`,
      );
      questions = rank(
        allQuestions.filter((q) => q.domainId === domain.id),
        tokenize(domain.name),
        (q) => `${q.prompt} ${q.scenario ?? ""}`,
      );
    }
  }

  switch (mode) {
    case "analogy":
      return composeAnalogy(certId, topic, cards);
    case "compare":
      return composeCompare(certId, topic, cards, questions);
    case "quiz":
      return composeQuiz(certId, topic, questions);
    case "tip":
      return composeTip(certId, topic, cards, questions);
    case "explain":
    default:
      return composeExplain(certId, topic, cards, questions);
  }
}

/** Suggested opening messages for a given exam. */
export function starterPrompts(certId: string, language: LanguageCode = "en"): string[] {
  const cert = CERT_BY_ID[certId];
  if (!cert) return [translate(language, "buddy.starterExplain", { topic: "shared responsibility" })];
  const domain = cert.domains[0];
  const card = cardsFor(certId).find((c) => c.domainId === domain.id);
  const topic = card ? card.front : domain.name;
  return [
    translate(language, "buddy.starterExplain", { topic }),
    translate(language, "buddy.starterAnalogy", { topic }),
    translate(language, "buddy.starterQuiz", { topic }),
    translate(language, "buddy.starterTip", { topic }),
  ];
}
