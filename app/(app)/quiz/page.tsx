"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flag, Bookmark, RotateCcw, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-i18n";
import { CERT_BY_ID, questionsFor, QUESTION_BY_ID } from "@/data";
import { shuffle, uid, scoreAttempt, formatMinutes } from "@/lib/utils";
import type { Attempt } from "@/lib/types";
import { Card, CardTitle, Button, Badge, ProgressBar } from "@/components/ui";

export default function QuizPage() {
  const { t } = useT();
  const s = useApp();
  const bookmarks = useApp((st) => st.bookmarks);

  const cert = CERT_BY_ID[s.activeCertId ?? "az-900"] ?? CERT_BY_ID["az-900"];
  const bank = useMemo(() => questionsFor(cert.id), [cert.id]);

  const [cfg, setCfg] = useState({
    domain: "all",
    difficulty: "all",
    mode: "practice",
    count: 10,
    missedOnly: false,
  });
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const questions = useMemo(() => {
    let pool = bank.filter(
      (q) =>
        (cfg.domain === "all" || q.domainId === cfg.domain) &&
        (cfg.difficulty === "all" || q.difficulty === +cfg.difficulty) &&
        (!cfg.missedOnly || bookmarks.includes(q.id)),
    );
    pool = shuffle(pool).slice(0, Math.min(cfg.count, pool.length));
    return pool;
  }, [cfg, bookmarks, bank]);

  // Exam-mode clock.
  const att = s.attempt;
  useEffect(() => {
    if (!att || att.mode !== "exam") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [att]);

  // ── Builder ────────────────────────────────────────────────────────
  if (!att && !done) {
    const available = bank.length;
    return (
      <div className="mx-auto max-w-xl space-y-4 py-2">
        <Card className="py-2">
          <CardTitle className="text-xl">{t("quiz.title", { exam: cert.examCode })}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("quiz.available", { count: available, domains: cert.domains.length })}
          </p>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm">
              {t("quiz.domain")}
              <Select2 value={cfg.domain} onChange={(v: string) => setCfg({ ...cfg, domain: v })}>
                <option value="all">{t("quiz.allDomains")}</option>
                {cert.domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.weight}%)
                  </option>
                ))}
              </Select2>
            </label>

            <label className="grid gap-1.5 text-sm">
              {t("quiz.difficulty")}
              <Select2 value={cfg.difficulty} onChange={(v: string) => setCfg({ ...cfg, difficulty: v })}>
                <option value="all">{t("quiz.mixed")}</option>
                <option value="1">{t("quiz.easy")}</option>
                <option value="2">{t("quiz.medium")}</option>
                <option value="3">{t("quiz.hard")}</option>
              </Select2>
            </label>

            <label className="grid gap-1.5 text-sm">
              {t("quiz.mode")}
              <Select2 value={cfg.mode} onChange={(v: string) => setCfg({ ...cfg, mode: v })}>
                <option value="practice">{t("quiz.practiceMode")}</option>
                <option value="exam">
                  {t("quiz.examMode", { minutes: cert.durationMin, count: cert.questionCount })}
                </option>
              </Select2>
            </label>

            <label className="grid gap-1.5 text-sm">
              {t("quiz.questions")}
              <Select2 value={String(cfg.count)} onChange={(v: string) => setCfg({ ...cfg, count: +v })}>
                {[5, 10, 20, 30, 45].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select2>
            </label>

            <Button
              disabled={!questions.length}
              onClick={() => {
                s.startAttempt({
                  id: uid("attempt"),
                  certId: cert.id,
                  mode: cfg.mode as "practice" | "exam",
                  domainIds: cfg.domain === "all" ? cert.domains.map((d) => d.id) : [cfg.domain],
                  questionIds: questions.map((q) => q.id),
                  answers: [],
                  startedAt: Date.now(),
                });
                setIdx(0);
                setPicked([]);
                setSubmitted(false);
              }}
            >
              {t("quiz.start")}
            </Button>

            <Button
              variant="outline"
              onClick={() => setCfg({ ...cfg, missedOnly: true })}
              disabled={!bookmarks.length}
            >
              <RotateCcw className="h-4 w-4" />
              {bookmarks.length
                ? t("quiz.retryFlagged", { count: bookmarks.length })
                : t("quiz.noFlagged")}
            </Button>

            {cfg.missedOnly && !bookmarks.length ? (
              <p className="text-xs text-muted-foreground">{t("quiz.flaggedHint")}</p>
            ) : null}
          </div>
        </Card>
      </div>
    );
  }

  // ── Results ────────────────────────────────────────────────────────
  if (done) {
    const last = s.pastAttempts[s.pastAttempts.length - 1];
    if (last) {
      return (
        <Results
          attempt={last}
          certId={cert.id}
          onRetry={() => {
            setDone(false);
            s.abandonAttempt();
          }}
        />
      );
    }
  }

  // ── Runner ─────────────────────────────────────────────────────────
  if (!att) return null;

  const q = QUESTION_BY_ID[att.questionIds[idx]];
  if (!q) return null;

  const multi = q.type === "multi";
  const toggleOpt = (id: string) =>
    setPicked((p) => (multi ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));
  const flagged = att.answers[idx]?.flagged ?? false;
  const bookmarked = bookmarks.includes(q.id);

  const elapsedMin = Math.floor((now - att.startedAt) / 60_000);
  const overTime = att.mode === "exam" && elapsedMin >= cert.durationMin;

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {t("quiz.questionOf", { current: idx + 1, total: att.questionIds.length })}
          {multi && ` · ${t("quiz.selectAll")}`}
        </span>
        <div className="flex items-center gap-3">
          {att.mode === "exam" ? (
            <span className={overTime ? "inline-flex items-center gap-1 text-amber-500" : "inline-flex items-center gap-1"}>
              <Clock className="h-3.5 w-3.5" />
              {formatMinutes(elapsedMin)} / {cert.durationMin}m
            </span>
          ) : (
            <span>{t("quiz.practiceLabel")}</span>
          )}
          <span>{cert.examCode}</span>
        </div>
      </div>

      <ProgressBar value={((idx + 1) / att.questionIds.length) * 100} label="Quiz progress" />

      {overTime ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          <AlertTriangle className="h-4 w-4" />
          {t("quiz.overtime", { minutes: cert.durationMin })}
        </p>
      ) : null}

      <Card>
        {q.scenario ? (
          <p className="mb-3 rounded-xl bg-muted p-3 text-sm italic text-muted-foreground">
            {q.scenario}
          </p>
        ) : null}

        <p className="font-medium">{q.prompt}</p>

        <div className="mt-4 space-y-2" role="group" aria-label="Answer options">
          {q.options.map((o) => {
            const sel = picked.includes(o.id);
            const isRight = q.correct.includes(o.id);
            const cls = submitted
              ? isRight
                ? "border-emerald-500 bg-emerald-500/10"
                : sel
                  ? "border-red-500 bg-red-500/10"
                  : "border-border opacity-60"
              : sel
                ? "border-accent bg-accent/10"
                : "border-border hover:border-accent/50";
            return (
              <button
                key={o.id}
                onClick={() => !submitted && toggleOpt(o.id)}
                disabled={submitted}
                className={`focus-ring w-full rounded-xl border p-3 text-left text-sm transition-colors ${cls}`}
              >
                <span className="me-2 font-semibold">{o.id.toUpperCase()})</span>
                {o.text}
                {submitted ? (
                  <span className="mt-1 block text-xs text-muted-foreground">{o.why}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {submitted ? (
          <p className="mt-3 text-xs text-muted-foreground">{t("quiz.review", { reference: q.reference })}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!submitted ? (
            <>
              <Button
                onClick={() => {
                  setSubmitted(true);
                  s.answer(idx, picked, flagged);
                }}
                disabled={!picked.length}
              >
                {t("quiz.checkAnswer")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => s.answer(idx, picked, !flagged)}
                aria-pressed={flagged}
              >
                <Flag className={`h-4 w-4 ${flagged ? "fill-accent text-accent" : ""}`} /> {t("quiz.flag")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => s.toggleBookmark(q.id)}
                aria-pressed={bookmarked}
                aria-label={t("quiz.bookmark")}
              >
                <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-accent text-accent" : ""}`} />
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => {
                  if (idx + 1 >= att.questionIds.length) {
                    s.finishAttempt();
                    setDone(true);
                  } else {
                    setIdx(idx + 1);
                    setPicked([]);
                    setSubmitted(false);
                  }
                }}
              >
                {idx + 1 >= att.questionIds.length ? t("common.finish") : t("common.next")}
              </Button>
              {idx + 1 < att.questionIds.length ? (
                <Button variant="ghost" size="sm" onClick={() => s.answer(idx, picked, !flagged)}>
                  {t("quiz.saveFlag")}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">{t("quiz.practiceOnly")}</p>
    </div>
  );
}

function Select2({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="focus-ring h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}

/* -------------------------------------------------------------------------
 * Results
 * ---------------------------------------------------------------------- */

function Results({
  attempt,
  certId,
  onRetry,
}: {
  attempt: Pick<Attempt, "questionIds" | "answers"> & { certId: string };
  certId: string;
  onRetry: () => void;
}) {
  const { t } = useT();
  const { overall, perDomain, results } = scoreAttempt(attempt, QUESTION_BY_ID);
  const cert = CERT_BY_ID[certId];
  const passPct = cert.scoreScale === "percent" ? cert.passingScore : 70;
  const missed = attempt.questionIds.filter((id, i) => !results[i]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <Card className="text-center">
        <CardTitle className="text-xl">{t("quiz.results", { exam: cert.examCode })}</CardTitle>
        <p
          className={`mt-4 text-5xl font-bold ${overall >= passPct ? "text-emerald-500" : "text-amber-500"}`}
        >
          {overall}%
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {overall >= passPct ? t("quiz.abovePass") : t("quiz.belowPass")}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={onRetry}>
            {t("quiz.buildAnother")}
          </Button>
          {cert ? (
            <a href={cert.officialExamUrl} target="_blank" rel="noreferrer noopener">
              <Button variant="outline">{t("quiz.official")}</Button>
            </a>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardTitle>{t("quiz.perDomain")}</CardTitle>
        <div className="mt-4 space-y-3">
          {cert.domains.map((d) => {
            const st = perDomain[d.id] ?? { pct: 0, correct: 0, total: 0 };
            return (
              <div key={d.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{d.name}</span>
                  <span className="text-muted-foreground">
                    {st.correct}/{st.total} · {st.pct}%
                  </span>
                </div>
                <ProgressBar value={st.pct} label={`${d.name} score`} />
              </div>
            );
          })}
        </div>
      </Card>

      {missed.length ? (
        <Card>
          <CardTitle>{t("quiz.revisit")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("quiz.revisitHint")}</p>
          <ul className="mt-4 space-y-2">
            {missed.map((id) => {
              const q = QUESTION_BY_ID[id];
              if (!q) return null;
              return (
                <li
                  key={id}
                  className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm"
                >
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  <div className="min-w-0">
                    <p className="font-medium">{q.prompt}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("quiz.correctAnswer", {
                        answer: `${q.correct.map((c) => c.toUpperCase()).join(", ")} — ${q.options.find((o) => o.id === q.correct[0])?.text ?? ""}`,
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {cert.domains.find((d) => d.id === q.domainId)?.name} · {q.reference}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="text-sm">{t("quiz.nothingMissed")}</p>
        </Card>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        <Link href="/readiness" className="text-accent hover:underline">
          {t("quiz.seeReadiness")}
        </Link>
      </p>
    </div>
  );
}
