import "server-only";
import { Pool } from "pg";

const globalForPool = globalThis as unknown as { __ledgerPool?: Pool };

export function getPool(connectionString: string): Pool {
  if (!globalForPool.__ledgerPool) {
    const pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 2500,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", () => {
      // Idle client errors are expected when the database stops; the next
      // probe acquires a fresh client and reports its own outcome.
    });
    globalForPool.__ledgerPool = pool;
  }
  return globalForPool.__ledgerPool;
}
