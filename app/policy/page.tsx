import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button, Card, DisclaimerBanner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Content policy",
  description:
    "How CertPath produces original practice content, what it refuses to host, and how its estimates should be read.",
};

const SECTIONS: { id: string; title: string; body: string[] }[] = [
  {
    id: "independence",
    title: "Independence",
    body: [
      "CertPath is an independent study aid. It is not affiliated with, endorsed by, sponsored by or connected to Microsoft, AWS, Google, CompTIA, Cisco, ISC2, PMI, the Linux Foundation, VMware or any other certification vendor or training provider.",
      "Vendor names and exam codes are used only to identify the exam a learner is preparing for, and to link to the vendor's own official pages so you can register, pay for and take the real exam. We use accent colours for charts; we do not use vendor logos or brand imagery.",
      "A practice milestone on CertPath is not a certification, a badge, a credential or a voucher for anything. Only the issuing vendor can award a certification, and only their exam can produce one.",
    ],
  },
  {
    id: "originality",
    title: "Originality and the line we do not cross",
    body: [
      "Every practice question and flashcard in CertPath is written from scratch for this platform. Questions are authored against the publicly published exam outline, domain weighting and objective list, and each answer option carries its own explanation of why it is right or wrong.",
      "We do not host, reproduce, paraphrase, encode or link to exam dumps, brain dumps, braindump PDFs, leaked questions, 'actual exam' question lists, or copyrighted question banks from third parties. We do not accept user-submitted items that are copied from an existing source; any submission is reviewed against the originality rules below before it is merged into a bank.",
      "We also do not attempt to reconstruct a specific exam's live items, and we do not publish content designed to let a learner identify or reproduce live exam questions.",
    ],
  },
  {
    id: "estimates",
    title: "Readiness scores, milestones and streaks",
    body: [
      "The readiness number is a self-assessment estimate computed from your own practice data: recent accuracy, how much of the question bank you have seen, and your flashcard mastery. It is a study-planning aid. It is not a prediction of exam results, not a probability of passing, and not a guarantee of anything.",
      "Study milestones (a first quiz completed, a 50% bank coverage, a seven-day streak) are labelled as milestones in the interface for exactly this reason. They are personal tracking, not professional achievements, and should never be presented to an employer as a certification.",
      "A practice score compares your answers with the answer key for the questions you were served. It does not measure the difficulty of the real exam, and the real exam may weight domains differently in practice than its published outline.",
    ],
  },
  {
    id: "accuracy",
    title: "Accuracy and corrections",
    body: [
      "We aim for factual accuracy against publicly available vendor documentation, standards and official study guides. Cloud services and certification outlines change; a question that was accurate when written may become stale.",
      "If you believe an item is factually wrong or ambiguous, please report it with the exam code and the item reference. Substantiated corrections are applied to the bank and the affected attempts are re-scored where the stored selections are still available.",
    ],
  },
  {
    id: "community",
    title: "Community contributions",
    body: [
      "Community contributions are welcome, but they enter a review workflow before they reach a learner. A proposed item must be original (not copied, translated from an existing dump, or paraphrased from a live exam), must not reveal or hint at live exam content, and must be objectively answerable with a cited reference.",
      "Proposed items are marked pending until a reviewer checks accuracy, domain placement, difficulty, and that the correct answer is unambiguously correct. Items that are copied, ambiguous, or vendor-specific trivia are rejected. Rejected items are not published.",
    ],
  },
  {
    id: "accounts",
    title: "Accounts and your data",
    body: [
      "You can use CertPath without an account; progress is then stored only in your browser on the device you used. If you create an account, your selected exams, quiz attempts, flashcard review schedule, study plans, bookmarks, custom cards and study-buddy conversations are stored against your account so they follow you across devices.",
      "Passwords are hashed with bcrypt and never stored or transmitted in plain text. Sign-in sessions use a random opaque token; only a keyed hash of that token is kept server-side. Each signed-in device gets its own session, and you can see them, sign individual devices out, or sign out everywhere from your account page.",
      "Failed sign-ins are throttled, so repeated incorrect passwords from one account or one address are slowed and then temporarily blocked. Password resets use a single-use link that expires after an hour and signs out your other devices when it is used.",
      "You can change your password and you can delete your account and its data at any time from the account page. Deletion requires your password, and removes your attempts, plans, custom cards, chat history and every session.",
    ],
  },
];

export default function PolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/" className="focus-ring text-xs text-muted-foreground hover:text-foreground">
        ← Back to CertPath
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Content policy</h1>
      <p className="mt-3 text-muted-foreground">
        The short version: everything here is original, everything is an estimate, and nothing here
        replaces the official exam.
      </p>

      <DisclaimerBanner className="mt-6" />

      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id}>
            <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
            <div className="mt-3 space-y-3">
              {section.body.map((para) => (
                <p key={para.slice(0, 32)} className="text-sm leading-relaxed text-muted-foreground">
                  {para}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Card className="mt-10">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <h2 className="text-sm font-semibold">Found something that violates this policy?</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Tell us which exam and item you mean and we will review it. Content that appears to
              reproduce a dump or a live exam is removed immediately.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/catalog">
                <Button size="sm" variant="secondary">
                  Back to the catalog
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="sm">Start studying</Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
