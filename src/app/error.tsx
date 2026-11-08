"use client";

import { useEffect } from "react";

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
      <h1 className="text-3xl font-semibold text-zinc-900">Ledger</h1>
      <p className="text-zinc-700">
        Ledger could not show the status page.
      </p>
      <div>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded border border-zinc-400 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
