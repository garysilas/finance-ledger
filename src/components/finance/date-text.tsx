import { formatCalendarDate } from "@/features/finance/format";

// A calendar date shown as written ("Nov 13, 2026"), with no zone shift.
export function DateText({ date }: { date: string }) {
  const text = formatCalendarDate(date);
  if (text === null) {
    return <span>Date unavailable</span>;
  }
  return <time dateTime={date}>{text}</time>;
}
