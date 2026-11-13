// Beta regression suite for spec 0003 pending replacement, atomic
// imports, receipts, and owner intent (AC-4, AC-5, AC-6, AC-11).
// Runs against the isolated test database; skipped when unset.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { setTransactionOverrides } from "@/features/finance/override-service";
import { setConnectionState } from "@/features/finance/connection-service";
import {
  acctObs,
  applyBatch,
  auditCount,
  categoryId,
  ensureTestKey,
  initOwner,
  makeConnection,
  monthlySpending,
  pendingTxn,
  postedTxn,
  syncState,
  txnRow,
} from "./helpers";

const url = process.env.TEST_DATABASE_URL ?? "";

describe.skipIf(!url)("provider batch regression", () => {
  let ownerId: string;
  let groceriesId: string;
  let seq = 0;

  beforeAll(async () => {
    ensureTestKey();
    ownerId = await initOwner(url);
    groceriesId = await categoryId(url, ownerId, "groceries");
  });

  // The owner is a singleton and the database persists across runs, so
  // every test claims unique provider ids and a month inside a random
  // per-run year window; monthly totals then isolate this test's records.
  const runYear = 3000 + Math.floor(Math.random() * 2000);
  const ids = () => {
    seq += 1;
    const year = runYear + Math.floor(seq / 12);
    const month = `${year}-${String((seq % 12) + 1).padStart(2, "0")}`;
    return {
      p: `t${seq}-pending`,
      s: `t${seq}-posted`,
      a: `t${seq}-extra`,
      month,
      date: `${month}-15`,
    };
  };

  type Ids = ReturnType<typeof ids>;
  const posted = (t: Ids, id: string, over: Record<string, unknown> = {}) =>
    postedTxn(id, {
      providerDate: t.date,
      postedDate: t.date,
      ...over,
    });
  const pending = (t: Ids, id: string, over: Record<string, unknown> = {}) =>
    pendingTxn(id, { providerDate: t.date, ...over });

  async function editCategory(
    transactionId: string,
    category: string | null,
    expectedOwnerEditRevision: string,
  ) {
    return setTransactionOverrides(url, {
      ownerId,
      transactionId,
      expectedOwnerEditRevision,
      categoryId: category,
      requestId: randomUUID(),
    });
  }

  it("supersedes a pending record when the posted record arrives first and links by provider pending id (AC-5, AC-6)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    const first = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [
        posted(t, t.s, { providerPendingTransactionId: t.p }),
      ],
    });
    expect(first.ok).toBe(true);

    const second = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      transactionUpserts: [pending(t, t.p)],
    });
    expect(second.ok).toBe(true);

    const pendingRow = await txnRow(url, connectionId, t.p);
    const postedRow = await txnRow(url, connectionId, t.s);
    expect(pendingRow.superseded_by_id).toBe(postedRow.id);

    const month = await monthlySpending(url, ownerId, t.month);
    expect(month.postedTotalUnits).toBe("500");
    expect(month.pendingOutflowUnits).toBe("0");
    expect(month.exclusions.superseded).toBe(1);
  });

  it("supersedes a pending record when it arrives before the posted record and copies an untouched owner category (AC-5)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    const first = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [pending(t, t.p)],
    });
    expect(first.ok).toBe(true);

    const pendingRow = await txnRow(url, connectionId, t.p);
    const edit = await editCategory(pendingRow.id, groceriesId, "0");
    expect(edit.ok).toBe(true);

    const second = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      transactionUpserts: [
        posted(t, t.s, { providerPendingTransactionId: t.p }),
      ],
    });
    expect(second.ok).toBe(true);

    const postedRow = await txnRow(url, connectionId, t.s);
    const after = await txnRow(url, connectionId, t.p);
    expect(after.superseded_by_id).toBe(postedRow.id);
    expect(postedRow.owner_category_id).toBe(groceriesId);
    expect(postedRow.category_intent).toBe("inherited");

    const month = await monthlySpending(url, ownerId, t.month);
    const groceries = month.categories.find((c) => c.stableKey === "groceries");
    expect(groceries?.spentUnits).toBe("500");
  });

  it("keeps an explicit posted reset when a pending override exists (AC-4, AC-5)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [
        pending(t, t.p),
        posted(t, t.s, { providerPendingTransactionId: t.p }),
      ],
    });
    const postedRow = await txnRow(url, connectionId, t.s);
    const reset = await editCategory(postedRow.id, null, "0");
    expect(reset.ok).toBe(true);

    // Re reconcile through another upsert of the pending record; the
    // explicit reset on the posted record must not be overwritten.
    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      transactionUpserts: [pending(t, t.p)],
    });

    const after = await txnRow(url, connectionId, t.s);
    expect(after.category_intent).toBe("reset");
    expect(after.owner_category_id).toBeNull();
  });

  it("rejects a cross account pending link and rolls the batch back (AC-5, AC-6)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      accountObservations: [acctObs("acct-a"), acctObs("acct-b")],
      transactionUpserts: [pending(t, t.p, { providerAccountId: "acct-b" })],
    });

    const bad = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      transactionUpserts: [
        posted(t, t.s, {
          providerAccountId: "acct-a",
          providerPendingTransactionId: t.p,
        }),
      ],
    });
    expect(bad).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect((await syncState(url, ownerId, connectionId)).cursor).toBe("c1");
  });

  it("rejects changes to an established link (AC-5)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [
        pending(t, t.p),
        posted(t, t.s, { providerPendingTransactionId: t.p }),
      ],
    });

    for (const link of [null, t.a]) {
      const attempt = await applyBatch(url, {
        ownerId,
        connectionId,
        expectedCursor: "c1",
        nextCursor: "c2",
        accountObservations: [],
        transactionUpserts: [
          posted(t, t.s, { providerPendingTransactionId: link }),
        ],
      });
      expect(attempt).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
  });

  it("never revives a superseded pending record when its posted successor is removed (AC-5)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [
        pending(t, t.p),
        posted(t, t.s, { providerPendingTransactionId: t.p }),
      ],
    });
    const removed = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      removalIds: [t.s],
    });
    expect(removed.ok).toBe(true);

    const pendingRow = await txnRow(url, connectionId, t.p);
    expect(pendingRow.superseded_by_id).not.toBeNull();

    const month = await monthlySpending(url, ownerId, t.month);
    expect(month.postedTotalUnits).toBe("0");
    expect(month.pendingOutflowUnits).toBe("0");
    expect(month.exclusions.removed).toBe(1);
    expect(month.exclusions.superseded).toBe(1);
  });

  it("restores a removed record when the provider presents it again (AC-5)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [posted(t, t.s)],
    });
    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      removalIds: [t.s],
    });
    const restored = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c2",
      nextCursor: "c3",
      accountObservations: [],
      transactionUpserts: [posted(t, t.s)],
    });
    expect(restored.ok).toBe(true);

    const row = await txnRow(url, connectionId, t.s);
    expect(row.removed_at).toBeNull();
    const month = await monthlySpending(url, ownerId, t.month);
    expect(month.postedTotalUnits).toBe("500");
  });

  it("rejects duplicate and overlapping batch identities (AC-6)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    const dupUpsert = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      transactionUpserts: [posted(t, t.s), posted(t, t.s)],
    });
    expect(dupUpsert).toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const dupAccount = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      accountObservations: [acctObs("acct-a"), acctObs("acct-a")],
    });
    expect(dupAccount).toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const overlap = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      transactionUpserts: [posted(t, t.s)],
      removalIds: [t.s],
    });
    expect(overlap).toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const dupRemoval = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      removalIds: [t.s, t.s],
    });
    expect(dupRemoval).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("rejects moving a transaction to another account (AC-6)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      accountObservations: [acctObs("acct-a"), acctObs("acct-b")],
      transactionUpserts: [posted(t, t.s)],
    });
    const moved = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      transactionUpserts: [posted(t, t.s, { providerAccountId: "acct-b" })],
    });
    expect(moved).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("never advances the cursor on a failed batch (AC-2, AC-6)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    const bad = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [posted(t, t.s, { currencyCode: "XXX" })],
    });
    expect(bad).toMatchObject({ ok: false, code: "UNSUPPORTED_MONEY" });
    expect((await syncState(url, ownerId, connectionId)).cursor).toBeNull();

    const good = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [posted(t, t.s)],
    });
    expect(good.ok).toBe(true);
  });

  it("acknowledges a replayed earlier batch with its historical cursor while sync stays current (AC-6, AC-11)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);
    const requestId = randomUUID();
    const upserts = [posted(t, t.s)];

    const first = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: upserts,
      requestId,
    });
    expect(first.ok).toBe(true);

    const second = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
    });
    expect(second.ok).toBe(true);

    const replay = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: upserts,
      requestId,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.alreadyApplied).toBe(true);
    expect(replay.value.committedCursor).toBe("c1");
    expect((await syncState(url, ownerId, connectionId)).cursor).toBe("c2");
  });

  it("shares a digest across equivalent array orderings (AC-11)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);
    const requestId = randomUUID();

    const first = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [posted(t, t.s), posted(t, t.a)],
      requestId,
    });
    expect(first.ok).toBe(true);

    const reordered = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [posted(t, t.a), posted(t, t.s)],
      requestId,
    });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.value.alreadyApplied).toBe(true);
  });

  it("shares a digest across equivalent decimal spellings (AC-2, AC-11)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);
    const requestId = randomUUID();

    const first = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [posted(t, t.s, { amount: "12.3" })],
      requestId,
    });
    expect(first.ok).toBe(true);

    const respelled = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [posted(t, t.s, { amount: "12.30" })],
      requestId,
    });
    // The spec requires equivalent decimal representations to share a
    // digest, so the retry must be acknowledged, not conflicted.
    expect(respelled.ok).toBe(true);
    if (!respelled.ok) return;
    expect(respelled.value.alreadyApplied).toBe(true);
  });

  it("treats override omission and explicit null as different requests (AC-11)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      transactionUpserts: [posted(t, t.s)],
    });
    const row = await txnRow(url, connectionId, t.s);

    const requestId = randomUUID();
    const first = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: "0",
      classification: "transfer",
      requestId,
    });
    expect(first.ok).toBe(true);

    const retried = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: "0",
      classification: "transfer",
      categoryId: null,
      requestId,
    });
    expect(retried).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("lets exactly one of two concurrent batches commit (AC-6)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    const [a, b] = await Promise.all([
      applyBatch(url, {
        ownerId,
        connectionId,
        expectedCursor: null,
        nextCursor: "c1",
        transactionUpserts: [posted(t, t.s)],
      }),
      applyBatch(url, {
        ownerId,
        connectionId,
        expectedCursor: null,
        nextCursor: "c1",
        accountObservations: [],
        transactionUpserts: [pending(t, t.p)],
      }),
    ]);
    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.code));
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(outcomes).toContain("CONFLICT");
  });

  it("never lets an import erase an owner correction (AC-4, AC-6)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [posted(t, t.s)],
    });
    const row = await txnRow(url, connectionId, t.s);
    const edit = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: "0",
      classification: "transfer",
      requestId: randomUUID(),
    });
    expect(edit.ok).toBe(true);

    const resync = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      transactionUpserts: [posted(t, t.s, { description: "renamed" })],
    });
    expect(resync.ok).toBe(true);

    const after = await txnRow(url, connectionId, t.s);
    expect(after.owner_classification).toBe("transfer");
    expect(after.classification_intent).toBe("override");

    const month = await monthlySpending(url, ownerId, t.month);
    expect(month.postedTotalUnits).toBe("0");
    expect(month.exclusions.transfer).toBe(1);
  });

  it("blocks a batch whose new amount contradicts an explicit posted override (AC-4, AC-6)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [posted(t, t.s)],
    });
    const row = await txnRow(url, connectionId, t.s);
    const edit = await setTransactionOverrides(url, {
      ownerId,
      transactionId: row.id,
      expectedOwnerEditRevision: "0",
      classification: "spending",
      requestId: randomUUID(),
    });
    expect(edit.ok).toBe(true);

    const flipped = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      transactionUpserts: [
        posted(t, t.s, {
          amount: "-5.00",
          providerClassification: "refund",
        }),
      ],
    });
    expect(flipped).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect((await syncState(url, ownerId, connectionId)).cursor).toBe("c1");
  });

  it("reports a correction conflict when an inherited classification would contradict the posted sign (AC-5, AC-11)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [pending(t, t.p)],
    });
    const pendingRow = await txnRow(url, connectionId, t.p);
    const edit = await setTransactionOverrides(url, {
      ownerId,
      transactionId: pendingRow.id,
      expectedOwnerEditRevision: "0",
      classification: "spending",
      requestId: randomUUID(),
    });
    expect(edit.ok).toBe(true);

    const linked = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      transactionUpserts: [
        posted(t, t.s, {
          amount: "-5.00",
          providerClassification: "refund",
          providerPendingTransactionId: t.p,
        }),
      ],
    });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(linked.value.correctionConflicts).toEqual([
      expect.objectContaining({
        field: "classification",
        reason: "inherited_classification_sign_conflict",
      }),
    ]);
    const postedRow = await txnRow(url, connectionId, t.s);
    expect(postedRow.classification_intent).toBe("untouched");
    expect(postedRow.owner_classification).toBeNull();
  });

  it("reports a conflict and restores untouched intent when a provider amount change invalidates an inherited classification (AC-5)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: [pending(t, t.p)],
    });
    const pendingRow = await txnRow(url, connectionId, t.p);
    await setTransactionOverrides(url, {
      ownerId,
      transactionId: pendingRow.id,
      expectedOwnerEditRevision: "0",
      classification: "spending",
      requestId: randomUUID(),
    });
    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c1",
      nextCursor: "c2",
      accountObservations: [],
      transactionUpserts: [
        posted(t, t.s, { providerPendingTransactionId: t.p }),
      ],
    });
    const linkedPosted = await txnRow(url, connectionId, t.s);
    expect(linkedPosted.classification_intent).toBe("inherited");

    const changed = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: "c2",
      nextCursor: "c3",
      accountObservations: [],
      transactionUpserts: [
        posted(t, t.s, {
          amount: "-5.00",
          providerClassification: "refund",
          providerPendingTransactionId: t.p,
        }),
      ],
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.correctionConflicts).toEqual([
      expect.objectContaining({
        field: "classification",
        reason: "inherited_classification_sign_conflict",
        previousSourceId: pendingRow.id,
      }),
    ]);
    const after = await txnRow(url, connectionId, t.s);
    expect(after.classification_intent).toBe("untouched");
    expect(after.owner_classification).toBeNull();
  });

  it("returns the successor id when editing a superseded pending record (AC-5)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      transactionUpserts: [
        pending(t, t.p),
        posted(t, t.s, { providerPendingTransactionId: t.p }),
      ],
    });
    const pendingRow = await txnRow(url, connectionId, t.p);
    const postedRow = await txnRow(url, connectionId, t.s);

    const edit = await editCategory(pendingRow.id, groceriesId, "0");
    expect(edit).toMatchObject({ ok: false, code: "CONFLICT" });
    if (!edit.ok) {
      expect(edit.successorId).toBe(postedRow.id);
    }
  });

  it("rejects imports on a disconnected connection (AC-9)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);

    const state = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: "1",
      targetState: "disconnected",
      requestId: randomUUID(),
    });
    expect(state.ok).toBe(true);

    const batch = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      transactionUpserts: [posted(t, t.s)],
    });
    expect(batch.ok).toBe(false);
  });

  it("writes no new audit events on exact replay (AC-11)", async () => {
    const t = ids();
    const connectionId = await makeConnection(url, ownerId);
    const requestId = randomUUID();
    const upserts = [posted(t, t.s)];

    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: upserts,
      requestId,
    });
    const before = await auditCount(url, ownerId, requestId);
    expect(before).toBe(1);

    const replay = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      nextCursor: "c1",
      transactionUpserts: upserts,
      requestId,
    });
    expect(replay.ok && replay.value.alreadyApplied).toBe(true);
    expect(await auditCount(url, ownerId, requestId)).toBe(before);
  });
});
