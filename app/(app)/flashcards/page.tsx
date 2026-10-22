"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, RotateCcw, Layers, Trash2 } from "lucide-react";

import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-i18n";
import { CERT_BY_ID, cardsFor } from "@/data";
import { Card, Button, Badge, Input, ProgressBar, EmptyState } from "@/components/ui";
import type { MessageKey } from "@/lib/i18n";

const RATINGS = [
  { id: "again", labelKey: "cards.again", hintKey: "cards.againHint" },
  { id: "hard", labelKey: "cards.hard", hintKey: "cards.hardHint" },
  { id: "good", labelKey: "cards.good", hintKey: "cards.goodHint" },
  { id: "easy", labelKey: "cards.easy", hintKey: "cards.easyHint" },
] as const satisfies readonly {
  id: "again" | "hard" | "good" | "easy";
  labelKey: MessageKey;
  hintKey: MessageKey;
}[];

export default function FlashcardsPage() {
  const { t } = useT();
  const s = useApp();
  const cert = CERT_BY_ID[s.activeCertId ?? "az-900"] ?? CERT_BY_ID["az-900"];

  const all = useMemo(
    () => [
      ...cardsFor(cert.id),
      ...s.customCards
        .filter((c) => c.certId === cert.id)
        .map((c) => ({ ...c, domainId: "custom", kind: "term" as const })),
    ],
    [cert.id, s.customCards],
  );

  const [domain, setDomain] = useState("all");
  const [dueOnly, setDueOnly] = useState(false);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const now = Date.now();
  const deck = useMemo(
    () =>
      all.filter((c) => {
        if (domain !== "all" && c.domainId !== domain) return false;
        if (dueOnly) {
          const due = s.reviews[c.id]?.dueAt ?? 0;
          if (due > now) return false;
        }
        return true;
      }),
    // `now` is intentionally not a dependency — it is refreshed by the interval below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, domain, dueOnly, s.reviews],
  );

  const card = deck.length ? deck[i % deck.length] : undefined;

  const rate = useCallback(
    (r: "again" | "hard" | "good" | "easy") => {
      if (!card) return;
      s.rateCard(card.id, r);
      setFlipped(false);
      setI((x) => x + 1);
      setReviewed((x) => x + 1);
      s.touchStreak();
    },
    [card, s],
  );

  // Global keyboard shortcuts: space flips, arrows rate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        rate("good");
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        rate("again");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rate]);

  const mastered = deck.filter((c) => (s.reviews[c.id]?.reps ?? 0) >= 2).length;
  const dueCount = all.filter((c) => (s.reviews[c.id]?.dueAt ?? 0) <= Date.now()).length;

  return (
    <div className="mx-auto max-w-xl space-y-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("cards.title", { exam: cert.examCode })}</h1>
          <p className="text-xs text-muted-foreground">
            {t("cards.progress", {
              mastered,
              total: deck.length,
              due: dueCount,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setI(0);
              setFlipped(false);
            }}
            className="focus-ring h-9 rounded-xl border border-border bg-background px-3 text-sm"
            aria-label={t("cards.filterLabel")}
          >
            <option value="all">{t("cards.allDomains", { count: all.length })}</option>
            {cert.domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({all.filter((c) => c.domainId === d.id).length})
              </option>
            ))}
            {all.some((c) => c.domainId === "custom") ? (
              <option value="custom">{t("cards.customFilter")}</option>
            ) : null}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setDueOnly((d) => !d)}
          aria-pressed={dueOnly}
          className={`focus-ring rounded-full border px-3 py-1 text-xs transition-colors ${
            dueOnly
              ? "border-accent bg-accent/15 text-accent"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("cards.dueOnly")}
        </button>
        {reviewed > 0 ? (
          <button
            onClick={() => {
              setI(0);
              setReviewed(0);
              setFlipped(false);
            }}
            className="focus-ring inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> {t("cards.restart")}
          </button>
        ) : null}
        <p className="text-[11px] text-muted-foreground">{t("cards.hint")}</p>
      </div>

      {deck.length ? (
        <>
          <ProgressBar
            value={deck.length ? (i % deck.length) / deck.length * 100 : 0}
            label="Deck progress"
            className="h-1"
          />

          <button
            className="perspective block w-full text-left"
            onClick={() => setFlipped(!flipped)}
            aria-label={t("cards.flip")}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={`${card!.id}-${String(flipped)}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.2 }}
              >
                <div
                  className="preserve-3d relative h-64 w-full transition-transform duration-500"
                  style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
                >
                  <div className="backface-hidden glass absolute inset-0 grid place-items-center rounded-3xl p-8 shadow-soft">
                    <div className="text-center">
                      <Badge tone="accent">{card!.kind}</Badge>
                      <p className="mt-4 text-xl font-semibold">{card!.front}</p>
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        {cert.domains.find((d) => d.id === card!.domainId)?.name ?? t("cards.yourCard")}
                      </p>
                    </div>
                  </div>
                  <div
                    className="backface-hidden rotate-y-180 glass absolute inset-0 grid place-items-center rounded-3xl p-8 shadow-soft"
                    style={{ backgroundColor: "hsl(var(--accent) / 0.08)" }}
                  >
                    <p className="text-center text-lg">{card!.back}</p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </button>

          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <Button
                key={r.id}
                variant={r.id === "again" ? "danger" : r.id === "easy" ? "primary" : "secondary"}
                onClick={() => rate(r.id)}
                title={`${t(r.labelKey)} — ${t(r.hintKey)}`}
              >
                {t(r.labelKey)}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title={dueOnly ? t("cards.nothingDueTitle") : t("cards.noCardsTitle")}
          description={dueOnly ? t("cards.nothingDueDesc") : t("cards.noCardsDesc")}
          action={
            dueOnly ? (
              <Button size="sm" variant="secondary" onClick={() => setDueOnly(false)}>
                {t("cards.studyAhead")}
              </Button>
            ) : null
          }
        />
      )}

      <p className="text-[11px] text-muted-foreground">{t("cards.masteryNote")}</p>

      <CustomCardForm certId={cert.id} />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Custom cards
 * ---------------------------------------------------------------------- */

function CustomCardForm({ certId }: { certId: string }) {
  const { t } = useT();
  const addCustomCard = useApp((s) => s.addCustomCard);
  const removeCustomCard = useApp((s) => s.removeCustomCard);
  const customCards = useApp((s) => s.customCards.filter((c) => c.certId === certId));

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {t("cards.createOwn")}
      </Button>
    );
  }

  return (
    <div className="glass space-y-2 rounded-2xl p-4">
      <Input
        value={front}
        onChange={(e) => setFront(e.target.value)}
        placeholder={t("cards.front")}
        aria-label={t("cards.front")}
      />
      <Input
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder={t("cards.back")}
        aria-label={t("cards.back")}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!front.trim() || !back.trim()}
          onClick={() => {
            addCustomCard({
              id: `user-${Date.now()}`,
              certId,
              front: front.trim(),
              back: back.trim(),
            });
            setFront("");
            setBack("");
            setOpen(false);
          }}
        >
          {t("cards.save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </div>

      {customCards.length ? (
        <ul className="space-y-1.5 pt-2">
          {customCards.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">
                <strong className="font-medium">{c.front}</strong>
                <span className="text-muted-foreground"> — {c.back}</span>
              </span>
              <button
                onClick={() => removeCustomCard(c.id)}
                aria-label={t("cards.deleteCard", { front: c.front })}
                className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
