import { CircleAlertIcon } from "lucide-react";
import { RetryButton } from "@/components/retry-button";
import { cn } from "@/components/utils";

// The shared error surface: a fixed, safe message plus a retry control.
// It never renders raw error text.
export function ErrorState({
  title = "Something went wrong",
  message = "Ledger could not show this content.",
  onRetry,
  retryLabel,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-4 rounded-lg border bg-card p-6 text-card-foreground",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <CircleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-destructive"
        />
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="mt-1 text-muted-foreground">{message}</p>
        </div>
      </div>
      <RetryButton
        onRetry={onRetry}
        label={retryLabel}
        pendingLabel={onRetry ? "Trying again..." : undefined}
        completeLabel={onRetry ? "Done." : undefined}
      />
    </div>
  );
}
