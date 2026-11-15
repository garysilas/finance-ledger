import "server-only";
import { cache } from "react";
import { logDatabaseProbe, type ProbeOutcome } from "@/server/diagnostics";
import { probeWithConfig } from "@/server/db/probe";
import { validateEnv } from "@/server/env";

export interface StatusResult {
  outcome: ProbeOutcome;
  durationMs: number;
  checkedAt: string;
}

// Cached per request: the status page and the shell health indicator share
// one probe and one log line per request.
export const checkDatabaseStatus = cache(async (): Promise<StatusResult> => {
  const started = performance.now();
  const env = validateEnv();
  if (!env.ok) {
    const durationMs = Math.round(performance.now() - started);
    logDatabaseProbe("CONFIG_INVALID", durationMs);
    return {
      outcome: "CONFIG_INVALID",
      durationMs,
      checkedAt: new Date().toISOString(),
    };
  }
  const result = await probeWithConfig(env.config.databaseUrl);
  return { ...result, checkedAt: new Date().toISOString() };
});
