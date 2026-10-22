import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  ClipboardCheck,
  Gauge,
  Layers,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { CERTIFICATIONS, CONTENT_STATS } from "@/data";
import { VENDORS } from "@/data/factories";
import { LanguageSwitcher } from "@/components/chrome";
import { Button, Card, DisclaimerBanner } from "@/components/ui";

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Original practice questions",
    body: "Every question is written from scratch — single answer, select-all-that-apply and scenario format, with an explanation for each option.",
  },
  {
    icon: Layers,
    title: "Spaced-repetition flashcards",
    body: "A SM-2 scheduler spaces reviews over days and weeks, so a term you keep forgetting comes back at the right moment.",
  },
  {
    icon: CalendarDays,
    title: "Day-by-day study plan",
    body: "Set an exam date and weekly hours. The planner weights your weak domains and spaces the heavy sessions so you never stack them.",
  },
  {
    icon: Gauge,
    title: "Readiness estimate",
    body: "A single number from your practice accuracy, bank coverage and flashcard mastery — always labelled an estimate, never a guarantee.",
  },
  {
    icon: Bot,
    title: "Study Buddy",
    body: "Ask for an explanation, an analogy, a comparison or a practice question. It answers from CertPath's own content bank.",
  },
  {
    icon: Sparkles,
    title: "Built for momentum",
    body: "Streaks, today's plan, due cards and a quick-quiz entry point on the dashboard keep the next step obvious.",
  },
];

export default function LandingPage() {
  const banks = CERTIFICATIONS.filter((c) => c.bankReady);

  return (
    <div className="min-h-dvh">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="focus-ring flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold tracking-tight">CertPath</span>
          </Link>
          <nav className="ms-auto flex items-center gap-2">
            <Link href="/policy" className="focus-ring hidden rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:block">
              Content policy
            </Link>
            <LanguageSwitcher className="hidden sm:block" />
            <Link href="/login">
              <Button size="sm" variant="ghost">
                Sign in
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="sm">
                Start studying <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="surface-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <Sparkles className="h-3 w-3" /> Independent · original content · no vendor affiliation
            </span>

            <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Prepare for the exam.{" "}
              <span className="bg-gradient-to-r from-accent to-emerald-500 bg-clip-text text-transparent">
                Not for a certification.
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
              CertPath is a multi-vendor exam-preparation platform. Practise with original questions,
              review with spaced repetition, plan your week, and watch a readiness{" "}
              <em>estimate</em> move — all in one place, with nothing copied from a leak.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/dashboard">
                <Button size="lg">
                  Start my plan <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/catalog">
                <Button size="lg" variant="outline">
                  Browse {CERTIFICATIONS.length} exams
                </Button>
              </Link>
            </div>

            <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {[
                { label: "Exams listed", value: CONTENT_STATS.exams },
                { label: "Full banks", value: CONTENT_STATS.banks },
                { label: "Original questions", value: CONTENT_STATS.questions },
                { label: "Flashcards", value: CONTENT_STATS.flashcards },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section className="border-t border-border/60 bg-card/20">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Everything the daily grind needs, nothing it doesn&apos;t
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Six focused modules that share one store, so what you practise is what the planner
            schedules and what the readiness estimate reads.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="flex flex-col gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/12 text-accent">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="text-sm font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Exams ──────────────────────────────────────────────────── */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {banks.length} exams with a complete original bank
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Every other exam in the catalog is listed with its full outline, domain weighting and
                official registration link — so you can plan even before a bank ships.
              </p>
            </div>
            <Link href="/catalog">
              <Button variant="outline">
                Open the catalog <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {banks.map((cert) => (
              <Card key={cert.id} className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {cert.examCode}
                </p>
                <h3 className="text-sm font-semibold">{cert.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {VENDORS[cert.vendor]?.name} · {cert.level}
                </p>
                <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
                  {cert.domains.length} domains · {cert.durationMin} min
                </p>
                <Link href={`/catalog?cert=${cert.id}`}>
                  <Button size="sm" variant="secondary" className="mt-2 w-full">
                    View details
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Compliance ─────────────────────────────────────────────── */}
      <section className="border-t border-border/60 bg-card/20">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Where the line is, and why
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <h3 className="text-sm font-semibold">What we will not do</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Host or reproduce exam dumps, brain dumps or leaked items.</li>
                <li>• Claim affiliation with, or endorsement from, any vendor.</li>
                <li>• Use vendor logos or trademarks as brand imagery.</li>
                <li>• Sell a certificate, badge or credential of any kind.</li>
              </ul>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold">What you get instead</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Original questions written to the published exam outline.</li>
                <li>• Readiness labelled an estimate, everywhere it appears.</li>
                <li>• Study milestones labelled as milestones, never credentials.</li>
                <li>• A direct link to the vendor's official exam on every card.</li>
              </ul>
            </Card>
          </div>
          <DisclaimerBanner className="mt-6" />
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Pick an exam. Get a plan. Do the work.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            No account needed to start — your progress is stored on this device. Create an account
            only if you want it to follow you across devices.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard">
              <Button size="lg">
                Start studying <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/policy">
              <Button size="lg" variant="outline">
                Read the content policy
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60 bg-card/20">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-md">
              <p className="text-sm font-bold tracking-tight">CertPath</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                CertPath is an independent study aid. It is not affiliated with, endorsed by or
                sponsored by Microsoft, AWS, Google, CompTIA, Cisco, ISC2, PMI, Linux Foundation,
                VMware or any other certification vendor. All practice content is original. Scores,
                readiness figures and milestones are self-assessment estimates, not certification
                outcomes. Always book and take the official exam through the vendor.
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              <Link href="/policy" className="focus-ring block hover:text-foreground">
                Content policy
              </Link>
              <Link href="/catalog" className="focus-ring block hover:text-foreground">
                Exam catalog
              </Link>
              <Link href="/login" className="focus-ring block hover:text-foreground">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
