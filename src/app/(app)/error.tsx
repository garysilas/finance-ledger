"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/states/error-state";

export default function AppErrorPage({ reset }: { reset: () => void }) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        event: "ledger.page_failed",
        outcome: "PAGE_FAILED",
        durationMs: null,
      }),
    );
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-10">
      <ErrorState
        title="Ledger could not show this page"
        message="Something went wrong while showing this page."
        onRetry={() => reset()}
        retryLabel="Try again"
      />
    </div>
  );
}
