"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";

import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-i18n";
import { CERT_BY_ID, QUESTION_BY_ID } from "@/data";
import { generatePlan, summarizePlan } from "@/lib/planner";
import { Card, CardTitle, Button, Input, Badge } from "@/components/ui";
import { scoreAttempt, todayISO, formatMinutes } from "@/lib/utils";

export default function PlannerPage() {
  const { t, language } = useT();
  const s = useApp();
  const cert = CERT_BY_ID[s.activeCertId ?? "az-900"] ?? CERT_BY_ID["az-900"];
  const existing = s.plans.find((p) => p.certId === cert.id);
  const [examDate, setExamDate] = useState(existing?.examDate ?? "");
  const [hours, setHours] = useState(existing?.hoursPerWeek ?? 6);
  const [weak, setWeak] = useState<string[]>(existing?.weakDomains ?? []);
  const today = todayISO();

  // Suggest weak domains from actual attempt performance.
  const suggested = useMemo(() => {
    const attempts = s.pastAttempts.filter((a) => a.certId === cert.id);
    const agg: Record<string, { correct: number; total: number }> = {};
    attempts.forEach((a) => {
      const { perDomain } = scoreAttempt(a, QUESTION_BY_ID);
      Object.entries(perDomain).forEach(([d, v]) => {
        const bucket = (agg[d] ??= { correct: 0, total: 0 });
        bucket.correct += v.correct;
        bucket.total += v.total;
      });
    });
    return Object.entries(agg)
      .filter(([, v]) => v.total >= 2 && v.correct / v.total < 0.6)
      .map(([d]) => d);
  }, [s.pastAttempts, cert.id]);

  const effectiveWeak = [...new Set([...weak, ...suggested])];
  const summary = existing ? summarizePlan(existing) : null;

  const grouped = useMemo(() => {
    if (!existing) return [];
    const map = new Map<string, typeof existing.tasks>();
    existing.tasks.forEach((t) => {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [existing]);

  const toggleWeak = (id: string) => {
    if (suggested.includes(id)) {
      // Auto-suggested domains stay on; only manual ones can be switched off.
      setWeak((w) => w.filter((x) => x !== id));
      return;
    }
    setWeak((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("plan.title", { exam: cert.examCode })}</h1>
        <p className="text-sm text-muted-foreground">{t("plan.subtitle")}</p>
      </div>

      <Card>
        <CardTitle>{t("plan.inputs")}</CardTitle>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            {t("plan.targetDate")}
            <Input type="date" min={today} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span>{t("plan.hoursWeek", { hours })}</span>
            <input
              type="range"
              min={2}
              max={30}
              value={hours}
              onChange={(e) => setHours(+e.target.value)}
              className="w-full accent-accent"
              aria-label={t("plan.hoursWeek", { hours })}
            />
          </label>

          <div className="text-sm">
            <p className="mb-2 flex flex-wrap items-center gap-2">
              {t("plan.weakDomains")}
              {suggested.length > 0 ? (
                <Badge tone="amber">{t("plan.autoSuggested")}</Badge>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              {cert.domains.map((d) => {
                const on = effectiveWeak.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggleWeak(d.id)}
                    className={`focus-ring rounded-full border px-3 py-1 text-xs transition-colors ${
                      on
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border text-muted-foreground hover:border-accent/40"
                    }`}
                    aria-pressed={on}
                  >
                    {d.name} ({d.weight}%)
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            disabled={!examDate}
            onClick={() =>
              s.upsertPlan(
                generatePlan({
                  cert,
                  examDate,
                  hoursPerWeek: hours,
                  weakDomains: effectiveWeak,
                  language,
                  // Reuse the id so regenerating replaces the existing plan.
                  id: existing?.id,
                }),
              )
            }
          >
            {existing ? t("plan.regenerate") : t("plan.generate")}
          </Button>

          <p className="text-[11px] text-muted-foreground">{t("plan.note")}</p>
        </div>
      </Card>

      {existing && summary ? (
        <Card>
          <CardTitle>{t("plan.yourPlan", { date: existing.examDate })}</CardTitle>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <Badge tone="neutral">
              <CalendarDays className="h-3 w-3" /> {t("plan.studyDays", { count: summary.days })}
            </Badge>
            <Badge tone="neutral">{t("plan.tasks", { count: summary.totalTasks })}</Badge>
            <Badge tone="neutral">{t("plan.total", { value: formatMinutes(summary.totalMinutes) })}</Badge>
            <Badge tone="neutral">{t("plan.perDay", { value: formatMinutes(summary.averageMinutes) })}</Badge>
          </div>

          <div className="mt-4 max-h-[30rem] space-y-4 overflow-y-auto pe-1">
            {grouped.map(([date, tasks]) => (
              <div key={date}>
                <p
                  className={`mb-1 text-xs font-semibold ${
                    date === today ? "text-accent" : "text-muted-foreground"
                  }`}
                >
                  {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  {date === today ? ` · ${t("plan.today")}` : ""}
                </p>
                <div className="space-y-1.5">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                    >
                      <button
                        onClick={() => {
                          s.toggleTask(existing.id, task.id);
                          s.touchStreak();
                        }}
                        aria-label={t("plan.toggleTask", { label: task.label })}
                        className={`h-4 w-4 shrink-0 rounded border ${
                          task.done ? "bg-accent border-accent" : "border-border"
                        }`}
                      />
                      <span className={task.done ? "line-through text-muted-foreground" : ""}>
                        {task.label}
                      </span>
                      <span className="ms-auto text-xs text-muted-foreground">
                        {t("card.minutes", { count: task.minutes })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button className="mt-4" variant="ghost" onClick={() => s.deletePlan(existing.id)}>
            <Trash2 className="h-4 w-4" /> {t("plan.delete")}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
