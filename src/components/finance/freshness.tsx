import {
  formatExactInstant,
  formatRelativeAge,
} from "@/features/finance/format";
import { cn } from "@/components/utils";

// A server component: the relative age is computed at render time, with no
// client ticking, and the exact instant sits inside <time>.
export function Freshness({
  at,
  timeZone,
  now,
  className,
}: {
  at: string;
  timeZone: string;
  now?: Date;
  className?: string;
}) {
  if (!at) {
    return <span className={className}>Never updated</span>;
  }
  const instant = new Date(at);
  if (Number.isNaN(instant.getTime())) {
    return <span className={className}>Never updated</span>;
  }
  const resolvedNow = now ?? new Date();
  return (
    <span className={cn("text-muted-foreground", className)}>
      Updated {formatRelativeAge(instant, resolvedNow)} ·{" "}
      <time dateTime={instant.toISOString()}>
        {formatExactInstant(instant, timeZone)}
      </time>
    </span>
  );
}
