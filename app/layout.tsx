import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CertPath — independent IT exam preparation",
    template: "%s · CertPath",
  },
  description:
    "Original practice questions, spaced-repetition flashcards, a day-by-day study planner and a readiness estimate for major IT certification exams. Independent — not affiliated with any certification vendor.",
  applicationName: "CertPath",
  keywords: [
    "certification practice questions",
    "exam prep",
    "spaced repetition",
    "study planner",
    "AWS certification",
    "Azure certification",
    "Security+",
    "CCNA",
  ],
  openGraph: {
    title: "CertPath — independent IT exam preparation",
    description:
      "Original practice questions, flashcards, a study planner and readiness estimates for major IT certification exams.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b111c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
