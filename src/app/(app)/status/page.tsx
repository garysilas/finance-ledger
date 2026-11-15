import { Suspense } from "react";
import { DatabaseStatus } from "@/components/database-status";
import { RetryButton } from "@/components/retry-button";
import { LoadingState } from "@/components/states/loading-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function StatusPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold">System status</h1>
        <p className="mt-2 text-muted-foreground">
          This page checks the connection to your local database.
        </p>
      </header>

      <Suspense fallback={<LoadingState label="Checking database" />}>
        <DatabaseStatus />
      </Suspense>

      <RetryButton />
    </div>
  );
}
