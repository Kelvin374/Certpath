import en, { type MessageKey } from "./en";
import ar from "./ar";
import bn from "./bn";
import de from "./de";
import es from "./es";
import fa from "./fa";
import fil from "./fil";
import fr from "./fr";
import hi from "./hi";
import id from "./id";
import it from "./it";
import ja from "./ja";
import ko from "./ko";
import mr from "./mr";
import nl from "./nl";
import pl from "./pl";
import pt from "./pt";
import ru from "./ru";
import sw from "./sw";
import ta from "./ta";
import te from "./te";
import th from "./th";
import tr from "./tr";
import ur from "./ur";
import vi from "./vi";
import zh from "./zh";

/* -------------------------------------------------------------------------
 * Supported languages
 * ---------------------------------------------------------------------- */

/**
 * Ordered roughly by number of speakers, with English first. The picker shows
 * the native name so learners can recognise their own language immediately.
 */
export const LANGUAGE_CODES = [
  "en",
  "zh",
  "hi",
  "es",
  "fr",
  "ar",
  "bn",
  "pt",
  "ru",
  "ur",
  "id",
  "de",
  "ja",
  "mr",
  "te",
  "tr",
  "ta",
  "vi",
  "ko",
  "it",
  "nl",
  "pl",
  "fa",
  "th",
  "fil",
  "sw",
] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export interface LanguageDefinition {
  code: LanguageCode;
  /** English name, used in logs and fallbacks only. */
  name: string;
  /** Name written in the language itself — what the picker shows. */
  nativeName: string;
  /** True for languages written right-to-left. */
  rtl?: boolean;
}

export const LANGUAGES: readonly LanguageDefinition[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zh", name: "Chinese (Simplified)", nativeName: "中文（简体）" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "ur", name: "Urdu", nativeName: "اردو", rtl: true },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "fa", name: "Persian", nativeName: "فارسی", rtl: true },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "fil", name: "Filipino", nativeName: "Filipino" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function isRtlLanguage(code: LanguageCode | string | null | undefined): boolean {
  return isLanguageCode(code) && languageDefinition(code).rtl === true;
}

export function languageDefinition(code: LanguageCode): LanguageDefinition {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}

/* -------------------------------------------------------------------------
 * Translation
 * ---------------------------------------------------------------------- */

export const DICTIONARIES: Record<LanguageCode, Partial<Record<MessageKey, string>>> = {
  en,
  zh,
  hi,
  es,
  fr,
  ar,
  bn,
  pt,
  ru,
  ur,
  id,
  de,
  ja,
  mr,
  te,
  tr,
  ta,
  vi,
  ko,
  it,
  nl,
  pl,
  fa,
  th,
  fil,
  sw,
};

/**
 * Look up a message in the selected language.
 *
 * Any language without a translation for `key` falls back to English, so a
 * partially translated release never shows raw keys or blank labels.
 * `{placeholder}` tokens in the template are replaced from `vars`.
 */
export function translate(
  language: LanguageCode | string | null | undefined,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const code = isLanguageCode(language) ? language : DEFAULT_LANGUAGE;
  const template = DICTIONARIES[code][key] ?? en[key] ?? key;
  if (!vars) return template;

  return Object.entries(vars).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    template,
  );
}

export type { MessageKey };
