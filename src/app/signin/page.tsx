import { LandmarkIcon, LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { validateEnv } from "@/server/env";
import { requireSession } from "@/server/session";
import { SignInForm } from "./signin-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function returnPath(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value !== undefined && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/spending";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string | string[] }>;
}) {
  const { return: rawReturn } = await searchParams;

  const env = validateEnv();
  if (env.ok) {
    const session = await requireSession(env.config.databaseUrl);
    if (session !== null) {
      redirect("/spending");
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between border-r bg-muted/40 p-10 lg:flex">
        <p className="text-lg font-semibold">Ledger</p>
        <div className="flex max-w-md flex-col gap-6">
          <h1 className="text-3xl font-semibold tracking-tight">
            Know where the money goes.
          </h1>
          <p className="text-muted-foreground">
            Ledger keeps a private ledger of your spending on this machine. Sign
            in to see stored balances, monthly totals, and where each category
            stands.
          </p>
          <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4 shrink-0" aria-hidden="true" />
              Tokens stay encrypted on the server, never in the browser.
            </li>
            <li className="flex items-center gap-2">
              <LandmarkIcon className="size-4 shrink-0" aria-hidden="true" />
              One owner, one connection, real stored data.
            </li>
            <li className="flex items-center gap-2">
              <LockKeyholeIcon className="size-4 shrink-0" aria-hidden="true" />
              Local only. Nothing leaves this machine.
            </li>
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">
          Loopback access only at 127.0.0.1.
        </p>
      </aside>

      <main className="flex min-h-dvh items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="rounded-xl border bg-card p-8 shadow-sm">
            <p className="text-lg font-semibold lg:hidden">Ledger</p>
            <h1 className="mt-1 text-2xl font-semibold lg:mt-0">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the owner password you set with{" "}
              <code className="font-mono text-xs">pnpm auth:set-password</code>.
            </p>
            <div className="mt-6">
              <SignInForm returnPath={returnPath(rawReturn)} />
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Sessions last 7 days while you use Ledger, up to 30 days.
          </p>
        </div>
      </main>
    </div>
  );
}
