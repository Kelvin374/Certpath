/* -------------------------------------------------------------------------
 * Device helpers
 *
 * Pure, dependency-free helpers used by the account screen to turn a raw
 * `User-Agent` string and a session timestamp into something a human can
 * read. No date library and no `Intl.RelativeTimeFormat` requirement beyond
 * what every modern browser already ships.
 * ---------------------------------------------------------------------- */

/** Browser signatures, most specific first. */
const BROWSER_SIGNATURES: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\/|EdgiOS\/|Edge\//, "Edge"],
  [/OPR\/|OPiOS\/|Opera\//, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

/** Platform signatures, most specific first. */
const PLATFORM_SIGNATURES: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone|iPod/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux|X11/, "Linux"],
];

function matchSignature(
  value: string,
  signatures: ReadonlyArray<readonly [RegExp, string]>,
): string | null {
  for (const [pattern, label] of signatures) {
    if (pattern.test(value)) return label;
  }
  return null;
}

/**
 * Turn a `User-Agent` header into a short, human label such as
 * "Chrome on Windows" or "Safari on iPhone".
 *
 * Returns "Unknown device" when there is no user agent at all or when the
 * string carries nothing we recognise.
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";

  const value = userAgent.trim();
  if (!value) return "Unknown device";

  const browser = matchSignature(value, BROWSER_SIGNATURES);
  const platform = matchSignature(value, PLATFORM_SIGNATURES);

  if (browser && platform) return `${browser} on ${platform}`;
  if (browser) return browser;
  if (platform) return `${platform} device`;
  return "Unknown device";
}

/** Parse the loose timestamp shapes the API can return. */
function toMillis(value: string | number | Date): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Describe when a session was last used.
 *
 * The current session is always labelled "This device"; other sessions read
 * "Active now", "Active 5 minutes ago", "Active yesterday" or, for anything
 * older, the date the session was last seen.
 */
export function describeSessionActivity(
  lastUsedAt: string | number | Date,
  current: boolean,
): string {
  if (current) return "This device";

  const millis = toMillis(lastUsedAt);
  if (millis === null) return "Unknown activity";

  const diff = Date.now() - millis;
  if (diff < 0) return "Active now";
  if (diff < 2 * MINUTE) return "Active now";

  if (diff < HOUR) {
    return `Active ${relative(-Math.round(diff / MINUTE), "minute")}`;
  }

  if (diff < DAY) {
    return `Active ${relative(-Math.round(diff / HOUR), "hour")}`;
  }

  if (diff < 2 * DAY) return "Active yesterday";

  return `Active ${new Date(millis).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

/**
 * Relative time, with a hand-rolled fallback so the helper keeps working in
 * environments without `Intl.RelativeTimeFormat`.
 */
function relative(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  const amount = Math.abs(value);
  const plural = amount === 1 ? unit : `${unit}s`;

  if (typeof Intl !== "undefined" && typeof Intl.RelativeTimeFormat === "function") {
    try {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "always" }).format(value, unit);
    } catch {
      // Fall through to the manual form below.
    }
  }

  return `${amount} ${plural} ago`;
}
