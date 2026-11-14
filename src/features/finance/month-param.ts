import { monthOfInstant, parseMonth } from "./dates";

// Reads the ?month=YYYY-MM contract: a valid value wins, a present but
// invalid value resolves to the current month and asks the page to rewrite
// the URL (normalized: true), and an absent value resolves quietly.
export function resolveMonthParam(
  raw: string | string[] | undefined,
  now: Date,
  timeZone: string,
): { month: string; normalized: boolean } {
  const current = monthOfInstant(now, timeZone);

  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) {
    return { month: current, normalized: false };
  }
  const parsed = parseMonth(value);
  if (parsed) {
    return {
      month: `${parsed.year.toString().padStart(4, "0")}-${parsed.month
        .toString()
        .padStart(2, "0")}`,
      normalized: false,
    };
  }
  return { month: current, normalized: true };
}
