import { TriangleAlertIcon } from "lucide-react";
import { Freshness } from "@/components/finance/freshness";
import { cn } from "@/components/utils";

// Warns that the data on screen is old: a warning plus the freshness line.
export function StaleNotice({
  at,
  timeZone,
  message = "This data may be out of date.",
  className,
}: {
  at: string;
  timeZone: string;
  message?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md bg-status-stale px-3 py-2 text-sm text-status-stale-foreground",
        className,
      )}
    >
      <TriangleAlertIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0"
      />
      <div>
        <p>{message}</p>
        <Freshness at={at} timeZone={timeZone} className="mt-0.5" />
      </div>
    </div>
  );
}
