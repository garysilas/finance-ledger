// Beta regression suite for spec 0003 owner mutations, budgets,
// category archive, token tamper, disconnect, and retry semantics
// (AC-4, AC-7, AC-8, AC-9, AC-11). Runs against the isolated database.
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { archiveCategory } from "@/features/finance/category-service";
import { setBudget } from "@/features/finance/budget-service";
import {
  createConnection,
  decryptConnectionToken,
  setConnectionState,
} from "@/features/finance/connection-service";
import { initializeOwner } from "@/features/finance/owner-service";
import { setTransactionOverrides } from "@/features/finance/override-service";
import {
  applyBatch,
  auditCount,
  categoryId,
  ensureArchived,
  ensureTestKey,
  initOwner,
  makeConnection,
  monthlySpending,
  postedTxn,
  q,
  syncState,
  txnRow,
} from "./helpers";

const url = process.env.TEST_DATABASE_URL ?? "";

describe.skipIf(!url)("owner mutation regression", () => {
  let ownerId: string;
  let seq = 0;

  const savedEnv: Record<string, string | undefined> = {};
  afterEach(() => {
    for (const key of ["LEDGER_TOKEN_KEY_PATH", "LEDGER_TOKEN_KEY_ID"]) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  beforeAll(async () => {
    ensureTestKey();
    savedEnv.LEDGER_TOKEN_KEY_PATH = process.env.LEDGER_TOKEN_KEY_PATH;
    savedEnv.LEDGER_TOKEN_KEY_ID = process.env.LEDGER_TOKEN_KEY_ID;
    ownerId = await initOwner(url);
  });

  const runYear = 7000 + Math.floor(Math.random() * 2000);
  const month = () => {
    seq += 1;
    const year = runYear + Math.floor(seq / 12);
    return `${year}-${String((seq % 12) + 1).padStart(2, "0")}`;
  };

  async function seedPosted(id: string, date: string) {
    const connectionId = await makeConnection(url, ownerId);
    const batch = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      transactionUpserts: [
        postedTxn(id, { providerDate: date, postedDate: date }),
      ],
    });
    if (!batch.ok) throw new Error(`seed failed: ${batch.code}`);
    return connectionId;
  }

  it("returns the existing owner on repeat initialization (AC-1, AC-11)", async () => {
    const again = await initializeOwner(url, {
      ownerId: randomUUID(),
      requestId: randomUUID(),
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.value!.ownerId).toBe(ownerId);
  });

  it("acknowledges a connection create retry and rejects a mismatched one (AC-11)", async () => {
    const requestId = randomUUID();
    const input = {
      ownerId,
      provider: "plaid" as const,
      environment: "sandbox" as const,
      providerItemId: `item-${randomUUID()}`,
      institutionId: "ins_retry",
      institutionName: "Retry Bank",
      tokenPlaintext: "first-token",
      requestId,
    };
    const first = await createConnection(url, input);
    expect(first.ok).toBe(true);

    const retry = await createConnection(url, {
      ...input,
      tokenPlaintext: "different-token-value",
    });
    // The digest ignores token plaintext; the retry acknowledges the
    // original connection and never replaces its token.
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.value.alreadyApplied).toBe(true);
      expect(retry.value.targetId).toBe(first.ok && first.value.targetId);
    }

    const mismatched = await createConnection(url, {
      ...input,
      institutionName: "Different Bank",
    });
    expect(mismatched).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("rejects forbidden connection transitions and stale revisions (AC-9)", async () => {
    const connectionId = await makeConnection(url, ownerId);

    const stale = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: "99",
      targetState: "needs_reconnect",
      requestId: randomUUID(),
    });
    expect(stale).toMatchObject({ ok: false, code: "CONFLICT" });

    const toNeeds = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: "1",
      targetState: "needs_reconnect",
      requestId: randomUUID(),
    });
    expect(toNeeds.ok).toBe(true);

    const backToActive = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: "2",
      targetState: "active",
      requestId: randomUUID(),
    });
    expect(backToActive).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });

    const off = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: "2",
      targetState: "disconnected",
      requestId: randomUUID(),
    });
    expect(off.ok).toBe(true);

    const revive = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: "3",
      targetState: "active",
      requestId: randomUUID(),
    });
    expect(revive).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });

  it("disconnects without the key and keeps history (AC-8, AC-9)", async () => {
    const m = month();
    const connectionId = await seedPosted(`disc-${seq}`, `${m}-10`);
    const revision = (await syncState(url, ownerId, connectionId)).revision;

    delete process.env.LEDGER_TOKEN_KEY_PATH;
    delete process.env.LEDGER_TOKEN_KEY_ID;

    const off = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: revision,
      targetState: "disconnected",
      requestId: randomUUID(),
    });
    expect(off.ok).toBe(true);

    const rows = await q<{ token_version: number | null }>(
      url,
      "SELECT token_version FROM ledger.connection WHERE id = $1",
      [connectionId],
    );
    expect(rows[0].token_version).toBeNull();

    const monthResult = await monthlySpending(url, ownerId, m);
    expect(monthResult.postedTotalUnits).toBe("500");
  });

  it("fails closed when the stored ciphertext is tampered (AC-8)", async () => {
    const connectionId = await makeConnection(url, ownerId);
    await q(
      url,
      `UPDATE ledger.connection
       SET token_ciphertext = token_ciphertext || decode('ff', 'hex')
       WHERE id = $1`,
      [connectionId],
    );
    const result = await decryptConnectionToken(url, {
      ownerId,
      connectionId,
    });
    expect(result.ok).toBe(false);
  });

  it("fails closed when the stored key id is tampered (AC-8)", async () => {
    const connectionId = await makeConnection(url, ownerId);
    await q(
      url,
      "UPDATE ledger.connection SET token_key_id = 'forged' WHERE id = $1",
      [connectionId],
    );
    const result = await decryptConnectionToken(url, {
      ownerId,
      connectionId,
    });
    expect(result).toMatchObject({ ok: false, code: "TOKEN_UNREADABLE" });
  });

  it("lets exactly one of two concurrent owner edits commit (AC-4, AC-7)", async () => {
    const m = month();
    const connectionId = await seedPosted(`race-${seq}`, `${m}-10`);
    const row = await txnRow(url, connectionId, `race-${seq}`);

    const [a, b] = await Promise.all([
      setTransactionOverrides(url, {
        ownerId,
        transactionId: row.id,
        expectedOwnerEditRevision: "0",
        classification: "transfer",
        requestId: randomUUID(),
      }),
      setTransactionOverrides(url, {
        ownerId,
        transactionId: row.id,
        expectedOwnerEditRevision: "0",
        classification: "card_payment",
        requestId: randomUUID(),
      }),
    ]);
    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.code));
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(outcomes).toContain("CONFLICT");
  });

  it("keeps category and classification edits independent (AC-4)", async () => {
    const m = month();
    const diningId = await categoryId(url, ownerId, "dining");
    const connectionId = await seedPosted(`indep-${seq}`, `${m}-10`);
    const row = await txnRow(url, connectionId, `indep-${seq}`);

    const cat = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: "0",
      categoryId: diningId,
      requestId: randomUUID(),
    });
    expect(cat.ok).toBe(true);
    if (!cat.ok) return;
    expect(cat.value.value!.ownerEditRevision).toBe("1");

    // Editing the classification alone must not disturb the category
    // override or its intent.
    const cls = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: "1",
      classification: "spending",
      requestId: randomUUID(),
    });
    expect(cls.ok).toBe(true);
    const after = await txnRow(url, connectionId, `indep-${seq}`);
    expect(after.owner_category_id).toBe(diningId);
    expect(after.category_intent).toBe("override");
    expect(after.classification_intent).toBe("override");
  });

  it("records a no_change receipt for a mutation that changes nothing (AC-11)", async () => {
    const m = month();
    const connectionId = await makeConnection(url, ownerId);

    const requestId = randomUUID();
    const same = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: "1",
      targetState: "active",
      requestId,
    });
    expect(same.ok).toBe(true);
    if (!same.ok) return;
    expect(same.value.outcome).toBe("no_change");
    expect(same.value.resultingRevision).toBe(1n);
    expect(await auditCount(url, ownerId, requestId)).toBe(0);

    const replay = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: "1",
      targetState: "active",
      requestId,
    });
    expect(replay.ok && replay.value.alreadyApplied).toBe(true);
    void m;
  });

  it("lets exactly one of two concurrent budget creates commit (AC-7)", async () => {
    const m = month();
    const feesId = await categoryId(url, ownerId, "fees");
    const [a, b] = await Promise.all([
      setBudget(url, {
        ownerId,
        categoryId: feesId,
        month: m,
        limit: "100.00",
        expectedRevision: "create",
        requestId: randomUUID(),
      }),
      setBudget(url, {
        ownerId,
        categoryId: feesId,
        month: m,
        limit: "200.00",
        expectedRevision: "create",
        requestId: randomUUID(),
      }),
    ]);
    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.code));
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(outcomes).toContain("CONFLICT");
  });

  it("rejects stale budget writes, negative limits, and archived categories (AC-7)", async () => {
    const m = month();
    const travelId = await categoryId(url, ownerId, "travel");

    const created = await setBudget(url, {
      ownerId,
      categoryId: travelId,
      month: m,
      limit: "300.00",
      expectedRevision: "create",
      requestId: randomUUID(),
    });
    expect(created.ok).toBe(true);

    const stale = await setBudget(url, {
      ownerId,
      categoryId: travelId,
      month: m,
      limit: "400.00",
      expectedRevision: "1",
      requestId: randomUUID(),
    });
    // Revision after create is 1, so a wrong expected value conflicts.
    const wrong = await setBudget(url, {
      ownerId,
      categoryId: travelId,
      month: m,
      limit: "400.00",
      expectedRevision: "5",
      requestId: randomUUID(),
    });
    expect(wrong).toMatchObject({ ok: false, code: "CONFLICT" });
    void stale;

    const negative = await setBudget(url, {
      ownerId,
      categoryId: travelId,
      month: `${Number(m.slice(0, 4)) + 1}-01`,
      limit: "-1.00",
      expectedRevision: "create",
      requestId: randomUUID(),
    });
    expect(negative).toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const healthId = await ensureArchived(url, ownerId, "health");

    const onArchived = await setBudget(url, {
      ownerId,
      categoryId: healthId,
      month: `${Number(m.slice(0, 4)) + 2}-01`,
      limit: "50.00",
      expectedRevision: "create",
      requestId: randomUUID(),
    });
    expect(onArchived).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("rejects edits and budgets against an archived category and keeps Uncategorized active (AC-4)", async () => {
    const m = month();
    const shoppingId = await ensureArchived(url, ownerId, "shopping");
    const connectionId = await seedPosted(`arch-${seq}`, `${m}-10`);
    const row = await txnRow(url, connectionId, `arch-${seq}`);

    const assign = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: "0",
      categoryId: shoppingId,
      requestId: randomUUID(),
    });
    expect(assign).toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const uncategorizedId = await categoryId(url, ownerId, "uncategorized");
    const archiveUnc = await archiveCategory(url, {
      ownerId,
      categoryId: uncategorizedId,
      expectedRevision: "1",
      requestId: randomUUID(),
    });
    expect(archiveUnc).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("rejects contradictory explicit classifications on edit (AC-4)", async () => {
    const m = month();
    const connectionId = await seedPosted(`sign-${seq}`, `${m}-10`);
    const row = await txnRow(url, connectionId, `sign-${seq}`);

    // +5.00 amount cannot become a refund through an owner edit.
    const bad = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: "0",
      classification: "refund",
      requestId: randomUUID(),
    });
    expect(bad).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });
});
