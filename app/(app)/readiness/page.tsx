"use client";

import Link from "next/link";
import { Award, BookOpen, Flag, Target, TrendingUp } from "lucide-react";

import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-i18n";
import { CERT_BY_ID, QUESTION_BY_ID, cardsFor, questionsFor } from "@/data";
import { VENDORS } from "@/data/factories";
import { computeReadiness, scoreAttempt, readinessVerdict, todayISO } from "@/lib/utils";
import { DomainRadar, TrendLine, DomainBars } from "@/components/charts";
import { Card, CardTitle, Badge, ProgressRing, DisclaimerBanner } from "@/components/ui";

export default function ReadinessPage() {
  const { t, language } = useT();
  const s = useApp();
  const certIds = s.selectedCertIds.length ? s.selectedCertIds : ["az-900"];
  const today = todayISO();

  return (
    <div className="space-y-6 py-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("ready.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("ready.subtitle")}</p>
      </div>

      {certIds.map((id) => {
        const cert = CERT_BY_ID[id];
        if (!cert) return null;

        const vendor = VENDORS[cert.vendor];
        const attempts = s.pastAttempts.filter((a) => a.certId === id);
        const scored = attempts.map((a) => ({
          at: a.finishedAt ?? a.startedAt,
          ...scoreAttempt(a, QUESTION_BY_ID),
        }));
        // Oldest first for the trend chart.
        const scores = scored.map((x) => x.overall);

        const bank = questionsFor(id);
        const attempted = new Set(attempts.flatMap((a) => a.questionIds)).size;
        const cardIds = cardsFor(id).map((c) => c.id);
        const mastered = cardIds.filter((c) => (s.reviews[c]?.reps ?? 0) >= 2).length;
        const mastery = cardIds.length ? Math.round((mastered / cardIds.length) * 100) : 0;
        const dueCards = cardIds.filter((c) => (s.reviews[c]?.dueAt ?? 0) <= Date.now()).length;

        const plan = s.plans.find((p) => p.certId === id);
        const daysUntilExam = plan
          ? Math.ceil((+new Date(`${plan.examDate}T00:00:00`) - Date.now()) / 86_400_000)
          : null;

        const readiness = computeReadiness({
          recentScores: scores,
          bankCoverage: bank.length ? (attempted / bank.length) * 100 : 0,
          cardMastery: mastery,
          daysUntilExam,
        });

        const radar = cert.domains.map((d) => {
          let correct = 0;
          let total = 0;
          scored.forEach((sc) => {
            const st = sc.perDomain[d.id];
            if (st) {
              correct += st.correct;
              total += st.total;
            }
          });
          return {
            domain: d.name.split(" ").slice(0, 2).join(" "),
            pct: total ? Math.round((correct / total) * 100) : 0,
          };
        });

        const weakest = [...radar].sort((a, b) => a.pct - b.pct)[0];
        const passPct = cert.scoreScale === "percent" ? cert.passingScore : 70;

        // If practice readiness is below target, estimate how much more
        // focused practice it would take, and compare it with the target date.
        const daysNeeded = readiness < 85 ? Math.ceil((85 - readiness) * 1.2) : 0;
        const readyDate = daysNeeded
          ? new Date(Date.now() + daysNeeded * 86_400_000).toISOString().slice(0, 10)
          : null;
        const planAllows = plan ? daysUntilExam !== null && daysUntilExam >= daysNeeded : true;

        const milestones = [
          { id: `first-quiz-${id}`, label: t("ready.mFirstQuiz"), got: attempts.length >= 1 },
          { id: "streak-7", label: t("ready.mStreak"), got: s.streak.count >= 7 },
          {
            id: `bank-half-${id}`,
            label: t("ready.mHalfBank"),
            got: bank.length > 0 && attempted >= bank.length / 2,
          },
          {
            id: `cards-${id}`,
            label: t("ready.mCards"),
            got: mastered >= 25,
          },
          { id: `ready-${id}`, label: t("ready.mReady"), got: readiness >= 85 },
        ];

        return (
          <Card key={id} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">
                  {cert.examCode} · {cert.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t("ready.passMark", { level: cert.level, pass: passPct, vendor: vendor?.name ?? "" })}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <ProgressRing value={readiness} size={84}>
                  <span className="text-xl font-bold">{readiness}%</span>
                </ProgressRing>
                {readyDate ? (
                  <Badge tone={planAllows ? "accent" : "amber"}>
                    <Target className="h-3 w-3" />
                    {planAllows
                      ? t("ready.readyAround", {
                          date: new Date(`${readyDate}T00:00:00`).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          }),
                        })
                      : t("ready.targetTight")}
                  </Badge>
                ) : (
                  <Badge tone="green">
                    <TrendingUp className="h-3 w-3" /> {t("ready.practiceReached")}
                  </Badge>
                )}
              </div>
            </div>

            <p className="text-sm leading-relaxed">
              {readinessVerdict(
                readiness,
                cert.name,
                weakest && weakest.pct < 70 ? weakest.domain : null,
                language,
              )}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: BookOpen,
                  label: t("ready.bankCoverage"),
                  value: `${attempted}/${bank.length}`,
                  hint: bank.length
                    ? t("ready.seen", { pct: Math.round((attempted / bank.length) * 100) })
                    : t("ready.noBank"),
                },
                {
                  icon: Award,
                  label: t("ready.cardsMastered"),
                  value: `${mastered}/${cardIds.length}`,
                  hint: t("ready.dueNow", { count: dueCards }),
                },
                {
                  icon: Flag,
                  label: t("ready.attempts"),
                  value: `${attempts.length}`,
                  hint: scores.length
                    ? t("ready.lastScore", { score: scores[scores.length - 1] })
                    : t("ready.noneYet"),
                },
                {
                  icon: Target,
                  label: t("ready.targetDate"),
                  value: plan ? plan.examDate : "—",
                  hint:
                    daysUntilExam === null
                      ? t("ready.noPlan")
                      : t("ready.daysAway", { days: daysUntilExam }),
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <stat.icon className="h-3 w-3" /> {stat.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground">{stat.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold">{t("ready.domainStrength")}</h4>
                <DomainRadar data={radar} accent={vendor?.accent} />
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  {t("ready.scoreTrend", { count: attempts.length })}
                </h4>
                {scored.length ? (
                  <TrendLine
                    data={scored.map((x, i) => ({ label: `#${i + 1}`, score: x.overall }))}
                    accent={vendor?.accent}
                  />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {t("ready.completeQuiz")}
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">{t("ready.domainBreakdown")}</h4>
              <DomainBars data={radar} accent={vendor?.accent} />
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">{t("ready.milestones")}</h4>
              <div className="flex flex-wrap gap-2">
                {milestones.map((m) => (
                  <Badge key={m.id + String(m.got)} tone={m.got ? "green" : "neutral"}>
                    <Award className="h-3 w-3" /> {m.label}
                    {m.got ? " ✓" : ""}
                  </Badge>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{t("ready.milestonesNote")}</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {t("ready.lastActivity", {
                  date: attempts.length
                    ? new Date(
                        Math.max(...attempts.map((a) => a.finishedAt ?? a.startedAt)),
                      ).toLocaleDateString()
                    : t("ready.none"),
                })}
                {plan && plan.examDate < today ? t("ready.targetPassed") : ""}
              </p>
              <div className="flex gap-2">
                <Link href="/quiz">
                  <Badge tone="accent" className="px-3 py-1.5">
                    {t("ready.practiseNow")}
                  </Badge>
                </Link>
                <a href={cert.officialExamUrl} target="_blank" rel="noreferrer noopener">
                  <Badge tone="neutral" className="px-3 py-1.5">
                    {t("common.officialExamArrow")}
                  </Badge>
                </a>
              </div>
            </div>
          </Card>
        );
      })}

      <DisclaimerBanner compact />
    </div>
  );
}
