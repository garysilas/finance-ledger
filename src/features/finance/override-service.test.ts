import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { setTransactionOverrides } from "./override-service";

const OWNER = "11111111-1111-4111-8111-111111111111";
const TXN = "22222222-2222-4222-8222-222222222222";
const CATEGORY = "33333333-3333-4333-8333-333333333333";
const URL = "postgresql://app@127.0.0.1:5432/ledger";

const valid = {
  ownerId: OWNER,
  transactionId: TXN,
  expectedOwnerEditRevision: "0",
  requestId: CATEGORY,
};

// covers spec 0007 AC-6 and AC-7 input guards: a malformed edit never
// reaches the database. Behavioral paths (revision conflict, removed and
// superseded rows, pending inheritance) run in
// test/foundation.transactions.test.ts against the test database.
describe("setTransactionOverrides input", () => {
  it.each([
    ["a non numeric revision", { expectedOwnerEditRevision: "abc" }],
    ["a negative revision", { expectedOwnerEditRevision: "-1" }],
    ["a missing revision", { expectedOwnerEditRevision: undefined }],
    ["an unknown classification", { classification: "gift" }],
    ["a non uuid category", { categoryId: "dining" }],
    ["an extra key", { actorId: OWNER }],
    ["a missing request id", { requestId: undefined }],
  ])("rejects %s with INVALID_INPUT", async (_n, extra) => {
    const input = Object.fromEntries(
      Object.entries({ ...valid, ...extra }).filter(
        ([, value]) => value !== undefined,
      ),
    );
    const result = await setTransactionOverrides(URL, input);
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });
});
