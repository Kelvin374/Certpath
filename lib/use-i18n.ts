"use client";

import { useCallback } from "react";

import {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  translate,
  type LanguageCode,
  type MessageKey,
} from "./i18n";
import { useApp } from "./store";

/** The learner's selected interface language. */
export function useLanguage(): LanguageCode {
  return useApp((state) => {
    const value = state.settings.language;
    return isLanguageCode(value) ? value : DEFAULT_LANGUAGE;
  });
}

/**
 * Translation helper for client components.
 *
 * ```tsx
 * const { t } = useT();
 * <h1>{t("nav.dashboard")}</h1>
 * <p>{t("dash.examIn", { days: 14 })}</p>
 * ```
 */
export function useT() {
  const language = useLanguage();
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  );
  return { t, language };
}
