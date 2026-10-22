"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { useAuth } from "./providers";
import { LanguageSwitcher } from "./chrome";
import { Button, Card, DisclaimerBanner, Field, Input } from "./ui";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { accountsEnabled, loading: authLoading, user, refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = params.get("next") ?? "/dashboard";

  useEffect(() => {
    if (!authLoading && user) router.replace(next);
  }, [authLoading, user, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "register" ? { email, password, name } : { email, password }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload.error ?? "Something went wrong. Try again.");
        setBusy(false);
        return;
      }

      await refresh();
      router.replace(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" className="focus-ring flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="text-sm font-bold tracking-tight">CertPath</span>
        </Link>
        <LanguageSwitcher />
      </div>

      <h1 className="text-2xl font-bold tracking-tight">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {mode === "login"
          ? "Sign in to pick up your attempts, plans and reviews on any device."
          : "An account keeps your progress in sync. You can study without one."}
      </p>

      {authLoading ? null : !accountsEnabled ? (
        <Card className="mt-6">
          <p className="text-sm font-medium">Accounts are currently disabled</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            No database is configured for this deployment, so progress is stored on this device only.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block">
            <Button size="sm">Continue without an account</Button>
          </Link>
        </Card>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "register" ? (
            <Field label="Name (optional)">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Alex"
                maxLength={80}
              />
            </Field>
          ) : null}

          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>

          <Field
            label="Password"
            hint={mode === "register" ? "At least 8 characters." : undefined}
          >
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="••••••••"
              minLength={mode === "register" ? 8 : undefined}
            />
          </Field>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy
              ? "Working…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
            {!busy ? <ArrowRight className="h-4 w-4" /> : null}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/register" className="focus-ring rounded text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="focus-ring rounded text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>

      <DisclaimerBanner compact className="mt-8" />
    </div>
  );
}
