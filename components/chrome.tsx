"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  CalendarDays,
  Check,
  ClipboardCheck,
  Compass,
  ExternalLink,
  Flame,
  Gauge,
  Layers,
  LayoutDashboard,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  Target,
  User as UserIcon,
} from "lucide-react";

import { CERT_BY_ID, cardsFor, questionsFor } from "@/data";
import { VENDORS } from "@/data/factories";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useAuth } from "./providers";
import { Badge, Button, Card, DisclaimerBanner, ProgressBar } from "./ui";

/* -------------------------------------------------------------------------
 * Exam card
 * ---------------------------------------------------------------------- */

export function ExamCard({ certId }: { certId: string }) {
  const cert = CERT_BY_ID[certId];
  const router = useRouter();
  const selected = useApp((s) => s.selectedCertIds.includes(certId));
  const active = useApp((s) => s.activeCertId === certId);
  const toggleSelectedCert = useApp((s) => s.toggleSelectedCert);
  const setActiveCert = useApp((s) => s.setActiveCert);

  if (!cert) return null;

  const vendor = VENDORS[cert.vendor];
  const questions = questionsFor(cert.id);
  const cards = cardsFor(cert.id);
  const hasBank = questions.length > 0;

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden transition-all hover:-translate-y-0.5",
        active && "border-accent/60 ring-1 ring-accent/30",
      )}
    >
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: vendor?.accent ?? "hsl(var(--accent))" }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {cert.examCode}
          </p>
          <h3 className="truncate text-base font-semibold">{cert.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {vendor?.name ?? cert.vendor} · {cert.level}
          </p>
        </div>
        {hasBank ? (
          <Badge tone="green">
            <Check className="h-3 w-3" /> Bank ready
          </Badge>
        ) : (
          <Badge tone="neutral">Metadata only</Badge>
        )}
      </div>

      <p className="line-clamp-3 text-sm text-muted-foreground">{cert.description}</p>

      <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        <Badge tone="neutral">{cert.durationMin} min</Badge>
        <Badge tone="neutral">{cert.questionCount} questions</Badge>
        {hasBank ? (
          <>
            <Badge tone="accent">{questions.length} practice questions</Badge>
            <Badge tone="accent">{cards.length} flashcards</Badge>
          </>
        ) : (
          <Badge tone="neutral">No practice bank yet</Badge>
        )}
      </div>

      {hasBank ? (
        <div className="space-y-1.5">
          {cert.domains.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 shrink-0 truncate text-muted-foreground">{d.name}</span>
              <ProgressBar value={d.weight} className="h-1" label={`${d.name} weight`} />
              <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                {d.weight}%
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {hasBank ? (
          <Button
            size="sm"
            onClick={() => {
              setActiveCert(cert.id);
              router.push("/quiz");
            }}
          >
            <ClipboardCheck className="h-3.5 w-3.5" /> Practice
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={selected ? "secondary" : "outline"}
          onClick={() => {
            toggleSelectedCert(cert.id);
            if (!selected) setActiveCert(cert.id);
          }}
          aria-pressed={selected}
        >
          {selected ? "Target selected" : "Set as target"}
        </Button>
        <a
          href={cert.officialExamUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring ml-auto inline-flex items-center gap-1 rounded text-[11px] text-muted-foreground hover:text-foreground"
        >
          Official exam <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------
 * Navigation
 * ---------------------------------------------------------------------- */

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/quiz", label: "Quiz", icon: ClipboardCheck },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/planner", label: "Planner", icon: CalendarDays },
  { href: "/readiness", label: "Readiness", icon: Gauge },
  { href: "/buddy", label: "Study Buddy", icon: Bot },
  { href: "/catalog", label: "Catalog", icon: Compass },
] as const;

/* -------------------------------------------------------------------------
 * Exam switcher
 * ---------------------------------------------------------------------- */

export function ExamSwitcher({ className }: { className?: string }) {
  const selectedCertIds = useApp((s) => s.selectedCertIds);
  const activeCertId = useApp((s) => s.activeCertId);
  const setActiveCert = useApp((s) => s.setActiveCert);

  const options = selectedCertIds
    .map((id) => CERT_BY_ID[id])
    .filter(Boolean)
    .sort((a, b) => a.examCode.localeCompare(b.examCode));

  if (!options.length) {
    return (
      <Link
        href="/catalog"
        className={cn(
          "focus-ring flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:text-foreground",
          className,
        )}
      >
        <Target className="h-3.5 w-3.5" /> Choose an exam
      </Link>
    );
  }

  return (
    <select
      value={activeCertId ?? options[0].id}
      onChange={(e) => setActiveCert(e.target.value)}
      aria-label="Active exam"
      className={cn(
        "focus-ring h-9 max-w-[190px] rounded-xl border border-border bg-background px-2.5 text-xs",
        className,
      )}
    >
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.examCode} · {c.name}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------------
 * Theme toggle
 * ---------------------------------------------------------------------- */

export function ThemeToggle() {
  const theme = useApp((s) => s.settings.theme);
  const setSettings = useApp((s) => s.setSettings);

  return (
    <button
      onClick={() => setSettings({ theme: theme === "dark" ? "light" : "dark" })}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="focus-ring grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/* -------------------------------------------------------------------------
 * Account menu
 * ---------------------------------------------------------------------- */

export function AccountMenu() {
  const { user, accountsEnabled, syncStatus, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!accountsEnabled) {
    return (
      <Link
        href="/login"
        className="focus-ring grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:text-foreground"
        aria-label="Sign in"
      >
        <UserIcon className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="focus-ring grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        <UserIcon className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-border bg-card p-2 shadow-soft"
        >
          {user ? (
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">{user.name || user.email}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {syncStatus === "saving"
                  ? "Saving…"
                  : syncStatus === "saved"
                    ? "Synced to your account"
                    : syncStatus === "offline"
                      ? "Offline — changes stay on this device"
                      : syncStatus === "error"
                        ? "Sync failed — retrying"
                        : "Signed in"}
              </p>
            </div>
          ) : (
            <div className="px-2.5 py-2">
              <p className="text-sm font-medium">Not signed in</p>
              <p className="text-xs text-muted-foreground">
                Progress is saved on this device only.
              </p>
            </div>
          )}
          <div className="my-1 h-px bg-border" />
          {user ? (
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ShieldCheck className="h-4 w-4" /> Account &amp; security
            </Link>
          ) : null}
          {user ? (
            <button
              onClick={() => {
                void signOut();
                setOpen(false);
              }}
              role="menuitem"
              className="focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          ) : (
            <Link
              href="/login"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <UserIcon className="h-4 w-4" /> Sign in
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Sidebar
 * ---------------------------------------------------------------------- */

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const streak = useApp((s) => s.streak);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Link href="/dashboard" onClick={onNavigate} className="focus-ring flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-bold tracking-tight">CertPath</span>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            Study independently
          </span>
        </span>
      </Link>

      <ExamSwitcher className="w-full" />

      <nav className="flex-1 space-y-0.5" aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent/12 font-medium text-accent"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
        <Flame className="h-4 w-4 text-amber-500" />
        <span>
          <strong className="text-foreground">{streak.count}</strong>-day streak
          {streak.best > streak.count ? ` · best ${streak.best}` : ""}
        </span>
      </div>

      <DisclaimerBanner compact className="text-[10px] leading-relaxed" />

      <Link
        href="/policy"
        onClick={onNavigate}
        className="focus-ring rounded text-[11px] text-muted-foreground hover:text-foreground"
      >
        Content policy &amp; disclaimer →
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Top bar
 * ---------------------------------------------------------------------- */

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const streak = useApp((s) => s.streak);

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md">
      <button
        onClick={onMenu}
        aria-label="Open navigation"
        className="focus-ring grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <ExamSwitcher className="w-full max-w-[260px] lg:hidden" />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs text-muted-foreground sm:flex">
          <Flame className="h-3.5 w-3.5 text-amber-500" />
          <strong className="text-foreground">{streak.count}</strong> day streak
        </span>
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */
