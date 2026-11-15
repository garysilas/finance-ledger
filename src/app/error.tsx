"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Root fallback for errors above the shell group.
export default function ErrorPage({ reset }: { reset: () => void }) {
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
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Ledger</h1>
      <p className="text-muted-foreground">Ledger could not show this page.</p>
      <div>
        <Button type="button" variant="outline" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
