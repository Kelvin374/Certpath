import { Suspense } from "react";
import type { Metadata } from "next";

import ResetPasswordClient from "./reset-password-client";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password for your CertPath account.",
};

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
