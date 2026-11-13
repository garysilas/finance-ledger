// Calendar date helpers. Dates are exact YYYY-MM-DD Gregorian values in
// years 0001-9999; months are YYYY-MM. JavaScript Date rollover is never
// used to validate input.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1];
}

export function parseCalendarDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = DATE_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

export function parseMonth(
  value: string,
): { year: number; month: number } | null {
  const match = MONTH_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

export function formatDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

// First day of the month as YYYY-MM-DD.
export function monthStart(year: number, month: number): string {
  return formatDate(year, month, 1);
}

// First day of the following month, or null for 9999-12 (the upper bound
// then becomes an inclusive final-date predicate instead of a range end).
export function nextMonthStart(year: number, month: number): string | null {
  if (month === 12) {
    if (year === 9999) {
      return null;
    }
    return formatDate(year + 1, 1, 1);
  }
  return formatDate(year, month + 1, 1);
}

// Last day of the month, used only for the 9999-12 inclusive bound.
export function monthEnd(year: number, month: number): string {
  return formatDate(year, month, daysInMonth(year, month));
}

const MONTH_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function monthFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = MONTH_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    });
    MONTH_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

// Current month (YYYY-MM) for an instant in the owner zone.
export function monthOfInstant(instant: Date, timeZone: string): string {
  const parts = monthFormatter(timeZone).formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}
