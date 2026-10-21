"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Database,
  FileText,
  KeyRound,
  Layers,
  MessageSquare,
  Monitor,
  ShieldAlert,
  Smartphone,
  Trash2,
  User,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  DisclaimerBanner,
  EmptyState,
  Field,
  Input,
} from "@/components/ui";
import { describeSessionActivity, describeUserAgent } from "@/lib/device";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

interface AccountUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string | null;
}

interface AccountSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
}

interface AccountCounts {
  attempts: number;
  plans: number;
  messages: number;
  cards: number;
}

interface AccountPayload {
  user: AccountUser | null;
  sessions: AccountSession[];
  counts: AccountCounts | null;
  accountsEnabled: boolean;
}

type Status = { kind: "ok" | "error"; text: string } | null;

const DEFAULT_RESET_MESSAGE =
  "If that address has a CertPath account, a reset link is on its way.";

/* -------------------------------------------------------------------------
 * Payload helpers
 * ---------------------------------------------------------------------- */

function readError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

function readString(payload: unknown, key: string): string | null {
  if (payload && typeof payload === "object" && key in payload) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function readNumber(payload: unknown, key: string): number | null {
  if (payload && typeof payload === "object" && key in payload) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function readBoolean(payload: unknown, key: string): boolean {
  if (payload && typeof payload === "object" && key in payload) {
    return (payload as Record<string, unknown>)[key] === true;
  }
  return false;
}

function normalize(payload: unknown): AccountPayload {
  const raw = (payload ?? {}) as Record<string, unknown>;

  const rawUser = raw.user;
  const user: AccountUser | null =
    rawUser && typeof rawUser === "object"
      ? {
          id: readString(rawUser, "id") ?? "",
          email: readString(rawUser, "email") ?? "",
          name: readString(rawUser, "name"),
          createdAt: readString(rawUser, "createdAt"),
        }
      : null;

  const sessionList: unknown[] = Array.isArray(raw.sessions) ? (raw.sessions as unknown[]) : [];

  const sessions: AccountSession[] = sessionList.flatMap((entry): AccountSession[] => {
    if (!entry || typeof entry !== "object") return [];
    const id = readString(entry, "id");
    if (!id) return [];
    return [
      {
        id,
        createdAt: readString(entry, "createdAt") ?? "",
        lastUsedAt: readString(entry, "lastUsedAt") ?? "",
        expiresAt: readString(entry, "expiresAt") ?? "",
        userAgent: readString(entry, "userAgent"),
        ipAddress: readString(entry, "ipAddress"),
        current: readBoolean(entry, "current"),
      },
    ];
  });

  const rawCounts = raw.counts;
  const counts: AccountCounts | null =
    rawCounts && typeof rawCounts === "object"
      ? {
          attempts: readNumber(rawCounts, "attempts") ?? 0,
          plans: readNumber(rawCounts, "plans") ?? 0,
          messages: readNumber(rawCounts, "messages") ?? 0,
          cards: readNumber(rawCounts, "cards") ?? 0,
        }
      : null;

  return {
    user,
    sessions,
    counts,
    accountsEnabled: raw.accountsEnabled === true,
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function deviceIcon(userAgent: string | null) {
  const value = (userAgent ?? "").toLowerCase();
  if (/mobile|iphone|ipod|android/.test(value)) return Smartphone;
  return Monitor;
}

/* -------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------- */

export default function AccountPage() {
  const router = useRouter();
  const { user: authUser, refresh } = useAuth();

  const [data, setData] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [nameStatus, setNameStatus] = useState<Status>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);

  const [sessionStatus, setSessionStatus] = useState<Status>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<Status>(null);

  const account = data?.user ?? null;
  const displayName = account?.name ?? authUser?.name ?? "";
  const email = account?.email ?? authUser?.email ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account", { cache: "no-store" });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setLoadError(readError(payload, "Could not load your account."));
        return;
      }

      setLoadError(null);
      const normalized = normalize(payload);
      setData(normalized);
      setName(normalized.user?.name ?? "");
    } catch {
      setLoadError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── Display name ───────────────────────────────────────────────── */

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending("name");
    setNameStatus(null);

    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setNameStatus({
          kind: "error",
          text: readError(payload, "Could not save your display name."),
        });
        return;
      }

      setNameStatus({ kind: "ok", text: "Display name saved." });
      await refresh();
      await load();
    } catch {
      setNameStatus({
        kind: "error",
        text: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setPending(null);
    }
  };

  /* ── Password ───────────────────────────────────────────────────── */

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordStatus(null);

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ kind: "error", text: "The new passwords do not match." });
      return;
    }

    setPending("password");

    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setPasswordStatus({
          kind: "error",
          text: readError(payload, "Could not change your password."),
        });
        return;
      }

      const revoked = readNumber(payload, "revoked") ?? 0;
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({
        kind: "ok",
        text: `Password changed. ${
          revoked === 1 ? "1 other device was" : `${revoked} other devices were`
        } signed out — sign in again there with the new password.`,
      });
    } catch {
      setPasswordStatus({
        kind: "error",
        text: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setPending(null);
    }
  };

  /* ── Sessions ───────────────────────────────────────────────────── */

  const revokeOne = async (id: string) => {
    setPending(`session:${id}`);
    setSessionStatus(null);

    try {
      const res = await fetch(`/api/account/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setSessionStatus({
          kind: "error",
          text: readError(payload, "Could not sign that device out."),
        });
        return;
      }

      setSessionStatus({ kind: "ok", text: "That device was signed out." });
      await load();
    } catch {
      setSessionStatus({
        kind: "error",
        text: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setPending(null);
    }
  };

  const signOutOthers = async () => {
    setPending("others");
    setSessionStatus(null);

    try {
      const res = await fetch("/api/account/sessions", { method: "DELETE" });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setSessionStatus({
          kind: "error",
          text: readError(payload, "Could not sign the other devices out."),
        });
        return;
      }

      const revoked = readNumber(payload, "revoked") ?? 0;
      setSessionStatus({
        kind: "ok",
        text: revoked === 0
          ? "No other devices were signed in."
          : `Signed out ${revoked} other device${revoked === 1 ? "" : "s"}.`,
      });
      await load();
    } catch {
      setSessionStatus({
        kind: "error",
        text: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setPending(null);
    }
  };

  const signOutEverywhere = async () => {
    setPending("everywhere");
    setSessionStatus(null);

    try {
      const res = await fetch("/api/auth/logout-all", { method: "POST" });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setSessionStatus({
          kind: "error",
          text: readError(payload, "Could not sign out."),
        });
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setSessionStatus({
        kind: "error",
        text: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setPending(null);
    }
  };

  /* ── Delete account ─────────────────────────────────────────────── */

  const deleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeleteStatus(null);

    if (deleteConfirmation !== "DELETE") {
      setDeleteStatus({ kind: "error", text: "Type DELETE to confirm." });
      return;
    }

    setPending("delete");

    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: deletePassword, confirmation: "DELETE" }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setDeleteStatus({
          kind: "error",
          text: readError(payload, "Could not delete your account."),
        });
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setDeleteStatus({
        kind: "error",
        text: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setPending(null);
    }
  };

  const busy = pending !== null;
  const sessions = data?.sessions ?? [];
  const counts = data?.counts ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">
          Your profile, password, and the devices currently signed in to CertPath.
        </p>
      </div>

      {loadError ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {loadError}
        </p>
      ) : null}

      {data && !data.accountsEnabled ? (
        <Card>
          <CardTitle>Accounts are currently disabled</CardTitle>
          <p className="mt-1.5 text-sm text-muted-foreground">
            No database is configured for this deployment, so there is no account to manage. Your
            progress stays on this device.
          </p>
        </Card>
      ) : null}

      {/* ── Profile ─────────────────────────────────────────────────── */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <User className="h-4 w-4 text-accent" /> Profile
        </CardTitle>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</dt>
            <dd className="mt-1 truncate text-sm">{email || "—"}</dd>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              The sign-in address cannot be changed here.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Display name</dt>
            <dd className="mt-1 truncate text-sm">{displayName || "Not set"}</dd>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Shown in the account menu and the buddy coach.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Member since
            </dt>
            <dd className="mt-1 text-sm">{formatDate(account?.createdAt)}</dd>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</dt>
            <dd className="mt-1 text-sm">
              {loading ? "Loading…" : email ? "Signed in" : "Signed out"}
            </dd>
          </div>
        </dl>
      </Card>

      {/* ── Display name ────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Display name</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalise your account. Leave it blank to remove your name.
        </p>

        <form onSubmit={saveName} className="mt-4 space-y-3">
          <Field label="Display name" hint="Up to 80 characters.">
            <Input
              id="account-display-name"
              aria-label="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex"
              maxLength={80}
              autoComplete="name"
            />
          </Field>

          {nameStatus ? (
            <p
              role={nameStatus.kind === "error" ? "alert" : "status"}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                nameStatus.kind === "error"
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
              )}
            >
              {nameStatus.text}
            </p>
          ) : null}

          <Button type="submit" disabled={busy}>
            {pending === "name" ? "Working…" : "Save display name"}
          </Button>
        </form>
      </Card>

      {/* ── Password ────────────────────────────────────────────────── */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-accent" /> Change password
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Changing your password signs out every other device. This one stays signed in.
        </p>

        <form onSubmit={changePassword} className="mt-4 space-y-3">
          <Field label="Current password">
            <Input
              id="account-current-password"
              aria-label="Current password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>

          <Field label="New password" hint="At least 10 characters. A long passphrase works well.">
            <Input
              id="account-new-password"
              aria-label="New password"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>

          <Field label="Confirm new password">
            <Input
              id="account-confirm-password"
              aria-label="Confirm new password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>

          {passwordStatus ? (
            <p
              role={passwordStatus.kind === "error" ? "alert" : "status"}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                passwordStatus.kind === "error"
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
              )}
            >
              {passwordStatus.text}
            </p>
          ) : null}

          <Button type="submit" disabled={busy}>
            {pending === "password" ? "Working…" : "Change password"}
          </Button>
        </form>
      </Card>

      {/* ── Sessions ────────────────────────────────────────────────── */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-accent" /> Active sessions
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Every device with a live session on this account.
        </p>

        {sessionStatus ? (
          <p
            role={sessionStatus.kind === "error" ? "alert" : "status"}
            className={cn(
              "mt-3 rounded-xl border px-3 py-2 text-sm",
              sessionStatus.kind === "error"
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
            )}
          >
            {sessionStatus.text}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <EmptyState
              title="No active sessions"
              description="Once you sign in on a device it will be listed here."
            />
          ) : (
            sessions.map((session) => {
              const Icon = deviceIcon(session.userAgent);
              const activity = describeSessionActivity(session.lastUsedAt, session.current);

              return (
                <div
                  key={session.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {describeUserAgent(session.userAgent)}
                        {session.current ? <Badge tone="accent">This device</Badge> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {activity} · IP {session.ipAddress ?? "unknown"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Signed in {formatDate(session.createdAt)}
                      </p>
                    </div>
                  </div>

                  {session.current ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void revokeOne(session.id)}
                    >
                      {pending === `session:${session.id}` ? "Working…" : "Sign out"}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void signOutOthers()}>
            {pending === "others" ? "Working…" : "Sign out other devices"}
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => void signOutEverywhere()}>
            {pending === "everywhere" ? "Working…" : "Sign out everywhere"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          &ldquo;Sign out other devices&rdquo; keeps this device signed in. &ldquo;Sign out
          everywhere&rdquo; ends this session too and returns you to the sign-in screen.
        </p>
      </Card>

      {/* ── Your data ───────────────────────────────────────────────── */}
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4 text-accent" /> Your data
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything CertPath stores for this account.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: FileText,
              label: "Quiz attempts",
              value: counts?.attempts ?? 0,
              hint: "Scored practice runs",
            },
            {
              icon: CalendarDays,
              label: "Study plans",
              value: counts?.plans ?? 0,
              hint: "Day-by-day schedules",
            },
            {
              icon: MessageSquare,
              label: "Coach messages",
              value: counts?.messages ?? 0,
              hint: "Buddy conversations",
            },
            {
              icon: Layers,
              label: "Flashcards",
              value: counts?.cards ?? 0,
              hint: "Custom cards saved",
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
      </Card>

      {/* ── Danger zone ─────────────────────────────────────────────── */}
      <Card className="border-danger/40">
        <CardTitle className="flex items-center gap-2 text-danger">
          <ShieldAlert className="h-4 w-4" /> Danger zone
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleting your account removes every attempt, study plan, custom flashcard and chat message
          attached to it. This cannot be undone.
        </p>

        {deleteOpen ? (
          <form onSubmit={deleteAccount} className="mt-4 space-y-3 rounded-xl border border-danger/40 bg-danger/5 p-4">
            <p className="text-sm font-medium text-danger">
              This permanently erases your CertPath account and all of its data.
            </p>

            <Field label="Type DELETE to confirm">
              <Input
                id="account-delete-confirmation"
                aria-label="Type DELETE to confirm"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </Field>

            <Field label="Your password">
              <Input
                id="account-delete-password"
                aria-label="Your password"
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>

            {deleteStatus ? (
              <p
                role="alert"
                className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {deleteStatus.text}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" disabled={busy}>
                {pending === "delete" ? "Working…" : "Permanently delete my account"}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirmation("");
                  setDeletePassword("");
                  setDeleteStatus(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="danger" className="mt-4" disabled={busy} onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" /> Delete account
          </Button>
        )}
      </Card>

      <DisclaimerBanner compact />
    </div>
  );
}
