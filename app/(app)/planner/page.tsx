"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";

import { useApp } from "@/lib/store";
import { CERT_BY_ID, QUESTION_BY_ID } from "@/data";
import { generatePlan, summarizePlan } from "@/lib/planner";
import { Card, CardTitle, Button, Input, Badge } from "@/components/ui";
import { scoreAttempt, todayISO, formatMinutes } from "@/lib/utils";

export default function PlannerPage() {
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
        <h1 className="text-xl font-bold tracking-tight">Study planner — {cert.examCode}</h1>
        <p className="text-sm text-muted-foreground">
          Set a target date and weekly hours; the planner builds the day-by-day schedule.
        </p>
      </div>

      <Card>
        <CardTitle>Plan inputs</CardTitle>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            Target exam date
            <Input type="date" min={today} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span>
              Hours per week: <strong>{hours}h</strong>
            </span>
            <input
              type="range"
              min={2}
              max={30}
              value={hours}
              onChange={(e) => setHours(+e.target.value)}
              className="w-full accent-accent"
              aria-label="Hours per week"
            />
          </label>

          <div className="text-sm">
            <p className="mb-2 flex flex-wrap items-center gap-2">
              Weak domains
              {suggested.length > 0 ? (
                <Badge tone="amber">auto-suggested from your quiz scores</Badge>
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
                  // Reuse the id so regenerating replaces the existing plan.
                  id: existing?.id,
                }),
              )
            }
          >
            {existing ? "Regenerate plan" : "Generate day-by-day plan"}
          </Button>

          <p className="text-[11px] text-muted-foreground">
            Multiple concurrent plans are supported — switch exams to manage each; heavy days are
            spaced automatically to avoid stacking.
          </p>
        </div>
      </Card>

      {existing && summary ? (
        <Card>
          <CardTitle>Your plan — exam on {existing.examDate}</CardTitle>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <Badge tone="neutral">
              <CalendarDays className="h-3 w-3" /> {summary.days} study days
            </Badge>
            <Badge tone="neutral">{summary.totalTasks} tasks</Badge>
            <Badge tone="neutral">{formatMinutes(summary.totalMinutes)} total</Badge>
            <Badge tone="neutral">{formatMinutes(summary.averageMinutes)}/day avg</Badge>
          </div>

          <div className="mt-4 max-h-[30rem] space-y-4 overflow-y-auto pr-1">
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
                  {date === today ? " · TODAY" : ""}
                </p>
                <div className="space-y-1.5">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                    >
                      <button
                        onClick={() => {
                          s.toggleTask(existing.id, t.id);
                          s.touchStreak();
                        }}
                        aria-label={`Toggle ${t.label}`}
                        className={`h-4 w-4 shrink-0 rounded border ${
                          t.done ? "bg-accent border-accent" : "border-border"
                        }`}
                      />
                      <span className={t.done ? "line-through text-muted-foreground" : ""}>
                        {t.label}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">{t.minutes}m</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button className="mt-4" variant="ghost" onClick={() => s.deletePlan(existing.id)}>
            <Trash2 className="h-4 w-4" /> Delete plan
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
