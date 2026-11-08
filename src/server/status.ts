import "server-only";
import { logDatabaseProbe, type ProbeOutcome } from "@/server/diagnostics";
import { probeWithConfig } from "@/server/db/probe";
import { validateEnv } from "@/server/env";

export interface StatusResult {
  outcome: ProbeOutcome;
  durationMs: number;
  checkedAt: string;
}

export async function checkDatabaseStatus(): Promise<StatusResult> {
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
}
