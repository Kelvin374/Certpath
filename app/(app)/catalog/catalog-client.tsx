"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";

import { CERTIFICATIONS, CERT_BY_ID } from "@/data";
import { VENDORS } from "@/data/factories";
import { Input, Select, Badge } from "@/components/ui";
import { ExamCard } from "@/components/chrome";
import { useT } from "@/lib/use-i18n";

const LEVELS = [
  { value: "Beginner", labelKey: "level.beginner" },
  { value: "Associate", labelKey: "level.associate" },
  { value: "Professional", labelKey: "level.professional" },
  { value: "Expert", labelKey: "level.expert" },
] as const;

export default function CatalogClient() {
  const { t } = useT();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [vendor, setVendor] = useState("all");
  const [level, setLevel] = useState("all");
  const [bankOnly, setBankOnly] = useState(false);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return CERTIFICATIONS.filter((c) => {
      const hit =
        !term ||
        (c.name + " " + c.examCode + " " + c.description + " " + c.level)
          .toLowerCase()
          .includes(term);
      return (
        hit &&
        (vendor === "all" || c.vendor === vendor) &&
        (level === "all" || c.level === level) &&
        (!bankOnly || Boolean(c.bankReady))
      );
    });
  }, [q, vendor, level, bankOnly]);

  const highlight = params.get("cert");
  const highlighted = highlight ? CERT_BY_ID[highlight] : undefined;

  return (
    <div className="space-y-6 py-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("catalog.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("catalog.subtitle", { count: CERTIFICATIONS.length })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("catalog.searchPlaceholder")}
            className="w-64 ps-9"
            aria-label={t("catalog.searchLabel")}
          />
        </div>

        <Select
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          aria-label={t("catalog.vendorLabel")}
          className="w-48"
        >
          <option value="all">{t("catalog.allVendors")}</option>
          {Object.values(VENDORS).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>

        <Select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          aria-label={t("catalog.levelLabel")}
          className="w-44"
        >
          <option value="all">{t("catalog.allLevels")}</option>
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {t(l.labelKey)}
            </option>
          ))}
        </Select>

        <button
          onClick={() => setBankOnly((b) => !b)}
          aria-pressed={bankOnly}
          className={`focus-ring inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
            bankOnly
              ? "border-accent bg-accent/12 text-accent"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t("catalog.bankOnly")}
        </button>
      </div>

      {highlighted?.nextSteps?.length ? (
        <div className="glass rounded-2xl p-4 text-sm">
          <Badge tone="accent">{t("catalog.recommended")}</Badge>
          <div className="mt-2 flex flex-wrap items-center gap-2 font-medium">
            {[highlight, ...highlighted.nextSteps]
              .filter((id): id is string => Boolean(id))
              .map((id, i, arr) => (
                <span key={id} className="flex items-center gap-2">
                  <span className="text-accent">{CERT_BY_ID[id]?.examCode ?? id}</span>
                  {i < arr.length - 1 ? (
                    <span className="text-muted-foreground">→</span>
                  ) : null}
                </span>
              ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {t("catalog.results", { count: results.length })}
        {results.length !== CERTIFICATIONS.length
          ? t("catalog.of", { total: CERTIFICATIONS.length })
          : ""}
      </p>

      {results.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((c) => (
            <ExamCard key={c.id} certId={c.id} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {t("catalog.noResults")}
        </p>
      )}
    </div>
  );
}
