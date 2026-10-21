import { Suspense } from "react";
import type { Metadata } from "next";

import CatalogClient from "./catalog-client";

export const metadata: Metadata = {
  title: "Exam catalog",
  description:
    "Browse every IT certification exam CertPath covers, with domain weighting and official registration links.",
};

export default function CatalogPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Loading catalog…</p>}>
      <CatalogClient />
    </Suspense>
  );
}
