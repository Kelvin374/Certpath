"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";

import { Button, Card, DisclaimerBanner, Field, Input } from "@/components/ui";

const DEFAULT_MESSAGE = "If that address has a CertPath account, a reset link is on its way.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const reason =
          payload && typeof payload === "object" && typeof payload.error === "string"
            ? payload.error
            : "Something went wrong. Try again.";
        setError(reason);
        setBusy(false);
        return;
      }

      // The response is deliberately identical whether or not the address is
      // registered, so the same message is shown either way.
      setMessage(
        payload && typeof payload === "object" && typeof payload.message === "string"
          ? payload.message
          : DEFAULT_MESSAGE,
      );

      // Development only: with no mail transport configured the API returns the
      // reset link so the flow can be exercised locally.
      setDevResetUrl(
        payload &&
          typeof payload === "object" &&
          typeof payload.devResetUrl === "string" &&
          payload.devResetUrl
          ? payload.devResetUrl
          : null,
      );
      setBusy(false);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  };

  const reset = () => {
    setMessage(null);
    setDevResetUrl(null);
    setError(null);
    setEmail("");
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Link href="/" className="focus-ring mb-8 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold tracking-tight">CertPath</span>
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter the email address you sign in with and we will send you a reset link.
      </p>

      {message ? (
        <Card className="mt-6">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Check your inbox</p>
              <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            </div>
          </div>

          {devResetUrl ? (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-xs font-medium text-amber-500">
                Development only — open the reset link
              </p>
              <a
                href={devResetUrl}
                className="focus-ring mt-1 block break-all text-sm text-accent hover:underline"
              >
                {devResetUrl}
              </a>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={reset}>
              Use a different email
            </Button>
            <Link href="/login" className="focus-ring self-center">
              <Button variant="ghost" size="sm">
                Back to sign in
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email">
            <Input
              id="forgot-password-email"
              aria-label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
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
            {busy ? "Working…" : "Send reset link"}
            {!busy ? <ArrowRight className="h-4 w-4" /> : null}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="focus-ring rounded text-accent hover:underline">
          Sign in
        </Link>
      </p>

      <DisclaimerBanner compact className="mt-8" />
    </div>
  );
}
