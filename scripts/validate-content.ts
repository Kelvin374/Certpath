/**
 * Content integrity validator.
 *
 * Checks every seeded question bank and flashcard deck for structural
 * problems that would produce a wrong or unanswerable item for a learner:
 * dangling domain references, correct-answer ids that do not exist, single
 * questions with multiple correct answers, scenario questions with no
 * scenario text, and duplicated ids or prompts.
 *
 * Run with:  npm run validate:content
 */
import {
  CERTIFICATIONS,
  CERT_BY_ID,
  FLASHCARDS,
  QUESTIONS,
  QUESTION_BY_ID,
  BANK_READY_IDS,
} from "../data";
import { isCorrect } from "../lib/utils";

const errors: string[] = [];
const warnings: string[] = [];

const fail = (msg: string) => errors.push(msg);
const warn = (msg: string) => warnings.push(msg);

/* ── Certifications ─────────────────────────────────────────────── */

const certIds = new Set<string>();
for (const cert of CERTIFICATIONS) {
  if (certIds.has(cert.id)) fail(`Duplicate certification id: ${cert.id}`);
  certIds.add(cert.id);

  if (!cert.name.trim()) fail(`${cert.id}: missing name`);
  if (!cert.examCode.trim()) fail(`${cert.id}: missing examCode`);
  if (!cert.description.trim()) fail(`${cert.id}: missing description`);
  if (!cert.officialExamUrl.startsWith("http")) fail(`${cert.id}: officialExamUrl is not a URL`);
  if (![30, 45, 60, 90, 100, 120, 130, 150, 180, 230].includes(cert.durationMin)) {
    warn(`${cert.id}: unusual durationMin (${cert.durationMin})`);
  }
  if (cert.scoreScale === "percent" && (cert.passingScore < 1 || cert.passingScore > 100)) {
    fail(`${cert.id}: percent passingScore out of range (${cert.passingScore})`);
  }
  if (cert.scoreScale === "scaled" && (cert.passingScore < 100 || cert.passingScore > 1000)) {
    fail(`${cert.id}: scaled passingScore out of range (${cert.passingScore})`);
  }

  const domainIds = new Set<string>();
  let weightTotal = 0;
  for (const d of cert.domains) {
    if (domainIds.has(d.id)) fail(`${cert.id}: duplicate domain id ${d.id}`);
    domainIds.add(d.id);
    if (!d.name.trim()) fail(`${cert.id}/${d.id}: missing domain name`);
    if (d.weight <= 0 || d.weight > 100) fail(`${cert.id}/${d.id}: weight out of range (${d.weight})`);
    weightTotal += d.weight;
  }
  if (cert.domains.length === 0) fail(`${cert.id}: no domains defined`);
  if (Math.abs(weightTotal - 100) > 1) {
    warn(`${cert.id}: domain weights sum to ${weightTotal}, not 100`);
  }

  for (const next of cert.nextSteps) {
    if (!certIds.has(next) && !CERT_BY_ID[next]) {
      fail(`${cert.id}: nextSteps references unknown exam "${next}"`);
    }
  }
}

/* ── Questions ──────────────────────────────────────────────────── */

const questionIds = new Set<string>();
const prompts = new Map<string, string>();

for (const q of QUESTIONS) {
  const where = `question "${q.id}"`;

  if (questionIds.has(q.id)) fail(`${where}: duplicate id`);
  questionIds.add(q.id);

  const cert = CERT_BY_ID[q.certId];
  if (!cert) {
    fail(`${where}: references unknown cert "${q.certId}"`);
    continue;
  }
  if (!cert.domains.some((d) => d.id === q.domainId)) {
    fail(`${where}: domain "${q.domainId}" is not a domain of ${cert.id}`);
  }

  if (![1, 2, 3].includes(q.difficulty)) fail(`${where}: difficulty must be 1–3`);
  if (!q.prompt.trim()) fail(`${where}: empty prompt`);
  if (!q.reference.trim()) fail(`${where}: empty reference`);

  const key = `${q.certId}:${q.prompt.toLowerCase().replace(/\s+/g, " ")}`;
  if (prompts.has(key)) fail(`${where}: duplicate prompt (also ${prompts.get(key)})`);
  prompts.set(key, q.id);

  if (q.options.length < 2) fail(`${where}: needs at least 2 options`);

  const optionIds = new Set<string>();
  for (const o of q.options) {
    if (optionIds.has(o.id)) fail(`${where}: duplicate option id "${o.id}"`);
    optionIds.add(o.id);
    if (!o.text.trim()) fail(`${where}/${o.id}: empty option text`);
    if (!o.why.trim()) fail(`${where}/${o.id}: empty option explanation`);
  }

  if (q.correct.length === 0) fail(`${where}: no correct answer`);
  for (const c of q.correct) {
    if (!optionIds.has(c)) fail(`${where}: correct option "${c}" does not exist`);
  }

  if (q.type === "single" && q.correct.length !== 1) {
    fail(`${where}: single question must have exactly 1 correct answer (has ${q.correct.length})`);
  }
  if (q.type === "multi" && q.correct.length < 2) {
    fail(`${where}: multi question needs at least 2 correct answers`);
  }
  if (q.type === "scenario" && !q.scenario?.trim()) {
    fail(`${where}: scenario question has no scenario text`);
  }
  if (q.type !== "scenario" && q.scenario) {
    warn(`${where}: non-scenario question carries scenario text`);
  }
  if (q.type === "multi" && !q.prompt.toLowerCase().match(/select all|all that apply|choose all/)) {
    warn(`${where}: multi question prompt does not say "select all that apply"`);
  }

  // A multi-select where every option is correct is a weak item — the learner
  // can pass by ticking everything.
  if (q.type === "multi" && q.correct.length === q.options.length) {
    fail(`${where}: every option is correct — a multi-select needs at least one distractor`);
  }

  // The explanation and the answer key must agree. The factory's generated
  // text marks distractors with a leading "Not correct", so an option that
  // says so must not be in the answer key.
  for (const o of q.options) {
    const explainsWrong = /^(not correct|not a |not an )/i.test(o.why.trim());
    if (explainsWrong && q.correct.includes(o.id)) {
      fail(`${where}/${o.id}: option is marked correct but its explanation says it is not`);
    }
    const explainsRight = /^correct\b/i.test(o.why.trim());
    if (explainsRight && !q.correct.includes(o.id)) {
      fail(`${where}/${o.id}: option is not in the answer key but its explanation says it is correct`);
    }
  }

  // The scoring rule the quiz engine relies on.
  if (!isCorrect(q, q.correct)) {
    fail(`${where}: correct answer does not score as correct`);
  }
  if (q.type === "multi" && isCorrect(q, q.correct.slice(0, 1))) {
    fail(`${where}: partial multi selection scores as correct`);
  }
}

/* ── Flashcards ─────────────────────────────────────────────────── */

const cardIds = new Set<string>();
for (const c of FLASHCARDS) {
  const where = `flashcard "${c.id}"`;
  if (cardIds.has(c.id)) fail(`${where}: duplicate id`);
  cardIds.add(c.id);

  const cert = CERT_BY_ID[c.certId];
  if (!cert) {
    fail(`${where}: references unknown cert "${c.certId}"`);
    continue;
  }
  if (!cert.domains.some((d) => d.id === c.domainId)) {
    fail(`${where}: domain "${c.domainId}" is not a domain of ${cert.id}`);
  }
  if (!c.front.trim()) fail(`${where}: empty front`);
  if (!c.back.trim()) fail(`${where}: empty back`);
  if (c.front.trim().length > 160) warn(`${where}: front is very long`);
}

/* ── Coverage report ────────────────────────────────────────────── */

const perCert = CERTIFICATIONS.map((cert) => {
  const qs = QUESTIONS.filter((q) => q.certId === cert.id);
  const fs = FLASHCARDS.filter((c) => c.certId === cert.id);
  const byDomain = cert.domains.map((d) => ({
    domain: d.name,
    questions: qs.filter((q) => q.domainId === d.id).length,
    cards: fs.filter((c) => c.domainId === d.id).length,
  }));
  return { cert, qs, fs, byDomain };
});

/* ── Output ─────────────────────────────────────────────────────── */

console.log("CertPath content validation");
console.log("==========================");
console.log(
  `Exams: ${CERTIFICATIONS.length}  |  seeded banks: ${BANK_READY_IDS.length}  |  questions: ${QUESTIONS.length}  |  flashcards: ${FLASHCARDS.length}`,
);
console.log("");

for (const { cert, qs, fs, byDomain } of perCert) {
  const ready = qs.length > 0;
  console.log(
    `${ready ? "●" : "○"} ${cert.examCode.padEnd(18)} ${String(qs.length).padStart(3)} q  ${String(fs.length).padStart(3)} cards  ${cert.domains.length} domains`,
  );
  if (ready) {
    for (const d of byDomain) {
      const flag = d.questions === 0 ? "  <-- no questions" : "";
      console.log(`    ${d.domain.padEnd(46)} ${d.questions} q / ${d.cards} cards${flag}`);
    }
  }
}

console.log("");

const typeCounts = QUESTIONS.reduce<Record<string, number>>((acc, q) => {
  acc[q.type] = (acc[q.type] ?? 0) + 1;
  return acc;
}, {});
const diffCounts = QUESTIONS.reduce<Record<string, number>>((acc, q) => {
  acc[`d${q.difficulty}`] = (acc[`d${q.difficulty}`] ?? 0) + 1;
  return acc;
}, {});
console.log("Question types:   ", typeCounts);
console.log("Difficulty mix:   ", diffCounts);
console.log("");

if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}):`);
  warnings.forEach((w) => console.log("  ! " + w));
  console.log("");
}

if (errors.length) {
  console.log(`ERRORS (${errors.length}):`);
  errors.forEach((e) => console.log("  x " + e));
  console.log("");
  process.exit(1);
}

console.log("✓ All content checks passed.");
