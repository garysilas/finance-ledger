import { currencyScale } from "./money";
import { parseCalendarDate, parseMonth } from "./dates";

// Pure display formatting for money, dates, and freshness. No server
// imports; both server and client components may use it.

export type MoneyContext = "spending" | "transaction" | "plain";

export interface MoneyFormatted {
  ok: true;
  /** Visible digits, with sign and symbol or code. */
  text: string;
  /** Full spoken form for an sr-only span. */
  srText: string;
  /** A short visible label when one applies ("net refund"). */
  label?: string;
}

const MINUS = "−"; // U+2212, the true minus sign.

// Builds the grouped, signed currency string without ever passing the value
// through a JavaScript number: the integer part formats as a BigInt and the
// fraction comes from exact minor-unit digits.
export function formatMoney(
  units: bigint,
  currency: string,
  context: MoneyContext,
): MoneyFormatted | { ok: false } {
  const scale = currencyScale(currency);
  if (scale === null) {
    return { ok: false };
  }

  const isUsd = currency === "USD";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: isUsd ? "narrowSymbol" : "code",
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });

  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const divisor = 10n ** BigInt(scale);
  const integerPart = absolute / divisor;
  const fractionPart = absolute % divisor;

  let digits = formatter.format(integerPart);
  if (scale > 0) {
    digits =
      digits.slice(0, -scale) + fractionPart.toString().padStart(scale, "0");
  }

  // Spoken amount: "1,234.56 dollars" for USD; other currencies already
  // carry their ISO code in the digits.
  let spokenAmount = digits;
  if (isUsd) {
    const bare = new Intl.NumberFormat("en-US", {
      style: "decimal",
      minimumFractionDigits: scale,
      maximumFractionDigits: scale,
    }).format(integerPart);
    const bareDigits =
      scale > 0
        ? bare.slice(0, -scale) + fractionPart.toString().padStart(scale, "0")
        : bare;
    spokenAmount = `${bareDigits} dollars`;
  }

  if (context === "spending") {
    if (negative) {
      return {
        ok: true,
        text: `${MINUS}${digits}`,
        srText: `net refund of ${spokenAmount}`,
        label: "net refund",
      };
    }
    return { ok: true, text: digits, srText: spokenAmount };
  }

  if (context === "transaction") {
    if (units > 0n) {
      return {
        ok: true,
        text: `+${digits}`,
        srText: `plus ${spokenAmount}`,
      };
    }
    return { ok: true, text: digits, srText: spokenAmount };
  }

  // plain: a true minus only when negative.
  return negative
    ? { ok: true, text: `${MINUS}${digits}`, srText: `minus ${spokenAmount}` }
    : { ok: true, text: digits, srText: spokenAmount };
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

// Date.UTC maps years 0-99 to 1900-1999, so the year is set explicitly to
// keep years 0001-0099 exact.
function utcInstant(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

// A calendar date as written, with no time zone shift: formatted from its
// parts through a fixed-UTC formatter.
export function formatCalendarDate(date: string): string | null {
  const parsed = parseCalendarDate(date);
  if (!parsed) {
    return null;
  }
  return DATE_FORMATTER.format(
    utcInstant(parsed.year, parsed.month, parsed.day),
  );
}

export function formatMonthLabel(month: string): string | null {
  const parsed = parseMonth(month);
  if (!parsed) {
    return null;
  }
  return MONTH_FORMATTER.format(utcInstant(parsed.year, parsed.month, 1));
}

// Relative age text ("3 hours ago") computed once at render time.
export function formatRelativeAge(at: Date, now: Date): string {
  const seconds = Math.floor((now.getTime() - at.getTime()) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  return `on ${formatCalendarDate(at.toISOString().slice(0, 10))}`;
}

const EXACT_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

// The exact instant in the given time zone, for the <time> element.
export function formatExactInstant(at: Date, timeZone: string): string {
  let formatter = EXACT_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    EXACT_FORMATTERS.set(timeZone, formatter);
  }
  return formatter.format(at);
}
