"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Brain, Layers, CalendarDays, Gauge, Flame, ArrowRight, Sparkles } from "lucide-react";

import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-i18n";
import { CERT_BY_ID, QUESTIONS, QUESTION_BY_ID, questionsFor, cardsFor } from "@/data";
import { computeReadiness, scoreAttempt, todayISO } from "@/lib/utils";
import { Card, CardTitle, Button, Badge, ProgressRing, DisclaimerBanner, FadeIn } from "@/components/ui";
import { ExamCard } from "@/components/chrome";

const ONBOARDING_EXAMS = ["az-900", "aws-clf", "security-plus", "ccna"];

export default function Dashboard() {
  const { t } = useT();
  const s = useApp();
  const touchStreak = useApp((st) => st.touchStreak);

  useEffect(() => {
    touchStreak();
  }, [touchStreak]);

  // ── Onboarding: pick exams ──
  if (!s.onboarded) {
    return (
      <FadeIn className="mx-auto max-w-4xl py-10">
        <Badge tone="accent" className="mb-3">
          <Sparkles className="h-3 w-3" /> {t("dash.onboardBadge")}
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">{t("dash.onboardTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("dash.onboardSubtitle")}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ONBOARDING_EXAMS.map((id) => (
            <ExamCard key={id} certId={id} />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button
            size="lg"
            disabled={!s.selectedCertIds.length}
            onClick={() => s.onboard(s.selectedCertIds)}
          >
            {t("dash.startPlan")} <ArrowRight className="h-4 w-4" />
          </Button>
          <Link href="/catalog" className="focus-ring rounded text-sm text-accent hover:underline">
            {t("dash.browseAll", { count: Object.keys(CERT_BY_ID).length })}
          </Link>
        </div>
        <DisclaimerBanner compact className="mt-6" />
      </FadeIn>
    );
  }

  const cert = s.activeCertId ? CERT_BY_ID[s.activeCertId] : undefined;
  const attempts = s.pastAttempts.filter((a) => !cert || a.certId === cert.id);
  // Oldest first — the readiness estimate weights later attempts more heavily.
  const scores = attempts
    .slice(-8)
    .map((a) => scoreAttempt(a, QUESTION_BY_ID).overall)
    .reverse();

  const bank = cert ? questionsFor(cert.id).length : 0;
  const attempted = new Set(attempts.flatMap((a) => a.questionIds)).size;
  const cardIds = cert ? cardsFor(cert.id).map((c) => c.id) : [];
  const mastered = cardIds.filter((id) => (s.reviews[id]?.reps ?? 0) >= 2).length;
  const mastery = cardIds.length ? Math.round((mastered / cardIds.length) * 100) : 0;
  const plan = s.plans.find((p) => !cert || p.certId === cert.id);
  const today = todayISO();
  const todays = plan?.tasks.filter((t) => t.date === today) ?? [];
  const dueCards = cardIds.filter((id) => (s.reviews[id]?.dueAt ?? 0) <= Date.now()).length;

  const daysUntilExam = plan
    ? Math.ceil((+new Date(`${plan.examDate}T00:00:00`) - Date.now()) / 86_400_000)
    : null;

  const readiness = computeReadiness({
    recentScores: scores,
    bankCoverage: bank ? (attempted / bank) * 100 : 0,
    cardMastery: mastery,
    daysUntilExam,
  });

  const lastScore = scores.length ? scores[scores.length - 1] : null;

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {cert ? `${cert.examCode} — ${cert.name}` : t("dash.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("dash.welcome")}</p>
        </div>
        <Badge tone="amber">
          <Flame className="h-3 w-3" /> {t("chrome.streak", { count: s.streak.count })}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col items-center text-center">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gauge className="h-4 w-4 text-accent" /> {t("dash.readiness")}
          </CardTitle>
          <ProgressRing value={readiness} className="mt-3">
            <span className="text-2xl font-bold">{readiness}%</span>
          </ProgressRing>
          <p className="mt-2 text-[11px] text-muted-foreground">{t("dash.readinessHint")}</p>
        </Card>

        <Card className="flex flex-col">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-accent" /> {t("dash.todaysPlan")}
          </CardTitle>
          {todays.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {todays.slice(0, 4).map((task) => (
                <li key={task.id} className="flex items-center gap-2">
                  <button
                    onClick={() => s.toggleTask(plan!.id, task.id)}
                    aria-label={t("dash.toggleTask", { label: task.label })}
                    className={`h-4 w-4 shrink-0 rounded border ${task.done ? "bg-accent border-accent" : "border-border"}`}
                  />
                  <span className={task.done ? "line-through text-muted-foreground" : ""}>
                    {task.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("dash.noPlan")} —{" "}
              <Link href="/planner" className="text-accent hover:underline">
                {t("dash.generateOne")}
              </Link>
              .
            </p>
          )}
          {plan ? (
            <p className="mt-auto pt-3 text-[11px] text-muted-foreground">
              {t("dash.examIn", { days: daysUntilExam ?? 0 })} ·{" "}
              {t("dash.doneToday", {
                done: todays.filter((task) => task.done).length,
                total: todays.length,
              })}
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-accent" /> {t("dash.cardsDue")}
          </CardTitle>
          <p className="mt-3 text-3xl font-bold">{dueCards}</p>
          <p className="text-xs text-muted-foreground">
            {t("dash.mastered", { mastered, total: cardIds.length })}
          </p>
          <Link href="/flashcards" className="mt-auto pt-3">
            <Button size="sm" variant="secondary">
              {t("dash.reviewNow")}
            </Button>
          </Link>
        </Card>

        <Card className="flex flex-col">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-accent" /> {t("dash.quickQuiz")}
          </CardTitle>
          <p className="mt-3 text-sm text-muted-foreground">
            {cert
              ? t("dash.bankQuestions", { count: bank, exam: cert.examCode })
              : t("dash.bankQuestionsAll", { count: bank })}
          </p>
          <Link href="/quiz" className="mt-auto pt-3">
            <Button size="sm">{t("dash.startSet")}</Button>
          </Link>
        </Card>
      </div>

      {attempts.length > 0 ? (
        <Card>
          <CardTitle>{t("dash.continue")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dash.lastAttempt", { score: lastScore ?? 0, count: attempts.length })}
            {cert ? (
              <>
                {" · "}
                <a
                  className="text-accent hover:underline"
                  href={cert.officialExamUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t("common.officialExamArrow")}
                </a>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("dash.seen", { seen: attempted, total: bank })}
          </p>
        </Card>
      ) : (
        <Card>
          <CardTitle>{t("dash.nothingAttempted")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dash.nothingDesc", {
              questions: QUESTIONS.length,
              exams: Object.keys(CERT_BY_ID).length,
            })}
          </p>
          <Link href="/quiz" className="mt-3 inline-block">
            <Button size="sm">{t("dash.startPractice")}</Button>
          </Link>
        </Card>
      )}

      <DisclaimerBanner compact />
    </div>
  );
}
