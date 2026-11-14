"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function RetryButton({
  onRetry,
  label = "Check again",
  pendingLabel = "Checking database connection...",
  completeLabel = "Check complete.",
}: {
  onRetry?: () => void;
  label?: string;
  pendingLabel?: string;
  completeLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending) {
      setAnnouncement(completeLabel);
    }
    wasPending.current = isPending;
  }, [isPending, completeLabel]);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            setAnnouncement("");
            if (onRetry) {
              onRetry();
            } else {
              router.refresh();
            }
          })
        }
      >
        {isPending ? pendingLabel : label}
      </Button>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? pendingLabel : announcement}
      </p>
    </div>
  );
}
