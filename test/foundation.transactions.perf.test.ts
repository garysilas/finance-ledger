// Performance check for spec 0007 AC-8: 100000 synthetic transactions
// (posted and pending) across 24 months in the isolated test database,
// ANALYZE, warm reads, then measured paged reads, filtered sums, and
// substring searches through the service. Requires TEST_DATABASE_URL.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import pg from "pg";

vi.mock("server-only", () => ({}));

import { initializeOwner } from "@/features/finance/owner-service";
import { createConnection } from "@/features/finance/connection-service";
import { applyProviderBatch } from "@/features/finance/batch-service";
import { listMonthTransactions } from "@/features/finance/transaction-service";
import { ensureTestKey } from "./helpers";

const appUrl = process.env.TEST_DATABASE_URL ?? "";

const MONTHS = 24;
const TOTAL = 100_000;
const WARM = 5;
const MEASURED = 20;
const P95_LIMIT_MS = 500;
// A year range no other suite uses, so reruns only add to this window.
const FIRST_YEAR = 8000;

describe.skipIf(!appUrl)("transaction table read performance", () => {
  it("meets the 500 ms p95 target for pages, filters, and search over 100000 rows", async () => {
    ensureTestKey();
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
      providerItemId: `item-txn-perf-${Date.now()}`,
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
      nextCursor: "txn-perf-cursor",
      accountObservations: [
        {
          providerAccountId: "acct-txn-perf",
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
    let accountId: string;
    let diningId: string;
    try {
      const accounts = await client.query<{ id: string }>(
        `SELECT id FROM ledger.account WHERE connection_id = $1`,
        [connectionId],
      );
      accountId = accounts.rows[0].id;
      const dining = await client.query<{ id: string }>(
        `SELECT id FROM ledger.category WHERE owner_id = $1 AND stable_key = 'dining'`,
        [ownerId],
      );
      diningId = dining.rows[0].id;

      // Every tenth row is pending; every fourth is dining; merchant
      // names cycle so searches match a realistic fraction.
      await client.query(
        `INSERT INTO ledger."transaction"
           (id, owner_id, connection_id, account_id,
            provider_transaction_id, amount_units, currency_code,
            currency_scale, posting_state, provider_date, posted_date,
            description, merchant_name, provider_category_id,
            provider_classification)
         SELECT gen_random_uuid(), $1, $2, $3,
                'txn-perf-' || $6 || '-' || g,
                ((g * 7919) % 200000) - 5000,
                'USD', 2,
                CASE WHEN g % 10 = 0 THEN 'pending' ELSE 'posted' END,
                make_date($5, 1, 1) + (g % 731),
                CASE WHEN g % 10 = 0 THEN NULL ELSE make_date($5, 1, 1) + (g % 731) END,
                'synthetic charge ' || g,
                'Merchant ' || (g % 400),
                CASE WHEN g % 4 = 0 THEN $7::uuid ELSE NULL END,
                CASE
                  WHEN g % 9 = 0 THEN 'transfer'
                  WHEN ((g * 7919) % 200000) - 5000 < 0 THEN 'refund'
                  ELSE 'spending'
                END
         FROM generate_series(1, $4) AS g`,
        [
          ownerId,
          connectionId,
          accountId,
          TOTAL,
          FIRST_YEAR,
          randomUUID(),
          diningId,
        ],
      );
      await client.query("ANALYZE ledger.transaction");
    } finally {
      client.release();
    }

    const months: string[] = [];
    for (let i = 0; i < MONTHS; i++) {
      const year = FIRST_YEAR + Math.floor(i / 12);
      months.push(`${year}-${String((i % 12) + 1).padStart(2, "0")}`);
    }

    const variants = (month: string) => [
      { ownerId, month, showExcluded: false },
      { ownerId, month, showExcluded: true },
      { ownerId, month, showExcluded: false, categoryId: diningId },
      { ownerId, month, showExcluded: false, query: "merchant 12" },
      { ownerId, month, showExcluded: true, accountId, query: "charge 9" },
    ];

    for (let i = 0; i < WARM; i++) {
      for (const input of variants(months[i % months.length])) {
        expect((await listMonthTransactions(appUrl, input)).ok).toBe(true);
      }
    }

    const durations: number[] = [];
    for (let i = 0; i < MEASURED; i++) {
      for (const input of variants(months[i % months.length])) {
        const started = performance.now();
        const result = await listMonthTransactions(appUrl, input);
        durations.push(performance.now() - started);
        expect(result.ok).toBe(true);
        // Second page through the keyset cursor.
        if (result.ok && result.value.nextCursor !== null) {
          const nextStarted = performance.now();
          const next = await listMonthTransactions(appUrl, {
            ...input,
            cursor: result.value.nextCursor,
          });
          durations.push(performance.now() - nextStarted);
          expect(next.ok).toBe(true);
        }
      }
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(0.95 * durations.length) - 1];
    console.log(
      `txn perf: p95=${p95.toFixed(1)}ms min=${durations[0].toFixed(1)}ms ` +
        `max=${durations[durations.length - 1].toFixed(1)}ms ` +
        `(${durations.length} reads, ${TOTAL} rows, ${MONTHS} months)`,
    );
    expect(p95).toBeLessThanOrEqual(P95_LIMIT_MS);

    await pool.end();
  }, 180_000);
});
