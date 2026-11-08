"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function RetryButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending) {
      setAnnouncement("Check complete.");
    }
    wasPending.current = isPending;
  }, [isPending]);

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            setAnnouncement("");
            router.refresh();
          })
        }
        className="rounded border border-zinc-400 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60"
      >
        {isPending ? "Checking database connection..." : "Check again"}
      </button>
      <p aria-live="polite" className="text-sm text-zinc-600">
        {isPending ? "Checking database connection..." : announcement}
      </p>
    </div>
  );
}
