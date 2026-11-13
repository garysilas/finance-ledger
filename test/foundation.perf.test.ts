// Temporary performance check for spec 0003 AC-12: 100000 synthetic
// transactions across 24 months in the isolated test database, ANALYZE,
// 5 warm reads, then 20 measured monthly reads through the service.
// Requires TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import pg from "pg";

vi.mock("server-only", () => ({}));

import { initializeOwner } from "@/features/finance/owner-service";
import { createConnection } from "@/features/finance/connection-service";
import { getMonthlySpending } from "@/features/finance/spending-service";
import { applyProviderBatch } from "@/features/finance/batch-service";

const appUrl = process.env.TEST_DATABASE_URL ?? "";
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? "";

const MONTHS = 24;
const TOTAL = 100_000;
const WARM = 5;
const MEASURED = 20;
const P95_LIMIT_MS = 500;

describe.skipIf(!appUrl || !migrationUrl)("monthly read performance", () => {
  it("meets the 500 ms p95 target over 100000 rows", async () => {
    const init = await initializeOwner(appUrl, {
      ownerId: randomUUID(),
      requestId: randomUUID(),
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    const ownerId = init.value.value?.ownerId ?? "";

    const conn = await createConnection(appUrl, {
      ownerId,
      provider: "plaid",
      environment: "sandbox",
      providerItemId: `item-perf-${Date.now()}`,
      institutionId: null,
      institutionName: null,
      tokenPlaintext: "perf-token",
      requestId: randomUUID(),
    });
    expect(conn.ok).toBe(true);
    if (!conn.ok) return;
    const connectionId = conn.value.value!.connectionId;

    const batch = await applyProviderBatch(appUrl, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "perf-cursor",
      accountObservations: [
        {
          providerAccountId: "acct-perf",
          name: "Perf",
          officialName: null,
          type: "depository",
          subtype: null,
          currencyCode: "USD",
          current: null,
          available: null,
          creditLimit: null,
          balanceObservedAt: null,
        },
      ],
      transactionUpserts: [],
      removalIds: [],
      requestId: randomUUID(),
    });
    expect(batch.ok).toBe(true);

    const pool = new pg.Pool({ connectionString: appUrl });
    const client = await pool.connect();
    try {
      const accounts = await client.query<{ id: string }>(
        `SELECT id FROM ledger.account WHERE connection_id = $1`,
        [connectionId],
      );
      const accountId = accounts.rows[0].id;

      // Bulk seed deterministic synthetic rows, spread over 24 months.
      await client.query(
        `INSERT INTO ledger."transaction"
           (id, owner_id, connection_id, account_id,
            provider_transaction_id, amount_units, currency_code,
            currency_scale, posting_state, provider_date, posted_date,
            description, provider_classification)
         SELECT gen_random_uuid(), $1, $2, $3,
                'perf-txn-' || g,
                ((g * 7919) % 200000) - 5000,
                'USD', 2, 'posted',
                date '2024-11-01' + (g % 731),
                date '2024-11-01' + (g % 731),
                'synthetic charge ' || g,
                CASE WHEN g % 9 = 0 THEN 'transfer'::text ELSE 'spending'::text END
         FROM generate_series(1, $4) AS g`,
        [ownerId, connectionId, accountId, TOTAL],
      );
      await client.query("ANALYZE");
    } finally {
      client.release();
    }

    const months: string[] = [];
    for (let i = 0; i < MONTHS; i++) {
      const year = 2024 + Math.floor((10 + i) / 12);
      const month = ((10 + i) % 12) + 1;
      months.push(`${year}-${String(month).padStart(2, "0")}`);
    }

    for (let i = 0; i < WARM; i++) {
      const warm = await getMonthlySpending(appUrl, {
        ownerId,
        month: months[i % months.length],
      });
      expect(warm.ok).toBe(true);
    }

    const durations: number[] = [];
    for (let i = 0; i < MEASURED; i++) {
      const started = performance.now();
      const result = await getMonthlySpending(appUrl, {
        ownerId,
        month: months[i % months.length],
      });
      durations.push(performance.now() - started);
      expect(result.ok).toBe(true);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(0.95 * durations.length) - 1];
    console.log(
      `perf: p95=${p95.toFixed(1)}ms min=${durations[0].toFixed(1)}ms ` +
        `max=${durations[durations.length - 1].toFixed(1)}ms ` +
        `(node ${process.version}, ${TOTAL} rows, ${MONTHS} months)`,
    );
    expect(p95).toBeLessThanOrEqual(P95_LIMIT_MS);

    await pool.end();
  }, 120_000);
});
