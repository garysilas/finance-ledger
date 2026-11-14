import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/utils";

// A skeleton block announced as busy, for content that is still loading.
export function LoadingState({
  label = "Loading",
  className,
  rows = 3,
}: {
  label?: string;
  className?: string;
  rows?: number;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={cn("flex flex-col gap-3", className)}
      role="status"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}
