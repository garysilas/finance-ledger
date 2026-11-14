import { formatMonthLabel } from "@/features/finance/format";

// A month shown as "November 2026".
export function MonthLabel({ month }: { month: string }) {
  const text = formatMonthLabel(month);
  if (text === null) {
    return <span>Month unavailable</span>;
  }
  return <time dateTime={month}>{text}</time>;
}
