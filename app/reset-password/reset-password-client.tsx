"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";

import { Button, Card, DisclaimerBanner, Field, Input } from "@/components/ui";

export default function ResetPasswordClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
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

      // The reset signs the learner in on this device and revokes every other
      // session, so send them straight to the dashboard.
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Link href="/" className="focus-ring mb-8 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold tracking-tight">CertPath</span>
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>

      {token ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          Setting a new password signs you in here and signs out every other device.
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">
          This reset link is missing its token. Request a new one and use the link from the email.
        </p>
      )}

      {token ? (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="New password" hint="At least 10 characters. A long passphrase works well.">
            <Input
              id="reset-password-new"
              aria-label="New password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>

          <Field label="Confirm new password">
            <Input
              id="reset-password-confirm"
              aria-label="Confirm new password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
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
            {busy ? "Working…" : "Set new password"}
            {!busy ? <ArrowRight className="h-4 w-4" /> : null}
          </Button>
        </form>
      ) : (
        <Card className="mt-6">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">No reset token</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Reset links expire after an hour and can only be used once. Request a fresh link to
                continue.
              </p>
            </div>
          </div>

          <Link href="/forgot-password" className="focus-ring mt-4 inline-block">
            <Button size="sm">Request a new reset link</Button>
          </Link>
        </Card>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Changed your mind?{" "}
        <Link href="/login" className="focus-ring rounded text-accent hover:underline">
          Back to sign in
        </Link>
      </p>

      <DisclaimerBanner compact className="mt-8" />
    </div>
  );
}
