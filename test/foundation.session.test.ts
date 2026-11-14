// Database regression suite for spec 0005 owner sessions, the connect
// helpers, and the spending view coverage flag (AC-1, AC-2, AC-5).
// Runs against the isolated test database on TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashPassword } from "@/server/password";
import { getSessionByToken, signIn } from "@/server/session";
import {
  decryptConnectionToken,
  findConnectionByProviderItem,
  getConnectionSyncState,
  listOwnerConnections,
  markSyncSuccess,
  setConnectionState,
} from "@/features/finance/connection-service";
import { listOwnerAccounts } from "@/features/finance/account-service";
import { getMonthlySpending } from "@/features/finance/spending-service";
import { initializeOwner } from "@/features/finance/owner-service";
import {
  acctObs,
  applyBatch,
  ensureTestKey,
  initOwner,
  makeConnection,
  q,
} from "./helpers";

const url = process.env.TEST_DATABASE_URL ?? "";
const SCRIPT = join(process.cwd(), "scripts/set-password.mjs");

function runScript(env: Record<string, string>) {
  return execFileSync("node", [SCRIPT], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function setOwnerPassword(password: string) {
  await q(url, "UPDATE ledger.owner SET password_hash = $1", [
    hashPassword(password),
  ]);
}

describe.skipIf(!url)("owner sessions and connect helpers", () => {
  let ownerId: string;
  const PASSWORD_A = "first long password";
  const PASSWORD_B = "second long password";

  beforeAll(async () => {
    ensureTestKey();
    ownerId = await initOwner(url);
    await setOwnerPassword(PASSWORD_A);
  });

  it("AC-1 signs in, stores only the token hash, and resolves the owner", async () => {
    const result = await signIn(url, PASSWORD_A);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await q<{ token_hash: Buffer; owner_id: string }>(
      url,
      `SELECT token_hash, owner_id FROM ledger.session
       ORDER BY created_at DESC LIMIT 1`,
    );
    expect(rows[0].token_hash).toEqual(
      createHash("sha256").update(result.value.token, "utf8").digest(),
    );
    expect(rows[0].token_hash.toString("utf8")).not.toBe(result.value.token);
    expect(rows[0].owner_id).toBe(ownerId);

    const session = await getSessionByToken(url, result.value.token);
    expect(session).toEqual({
      ok: true,
      value: expect.objectContaining({ ownerId }),
    });
  });

  it("AC-1/AC-8 rejects a wrong password with the generic failure", async () => {
    const result = await signIn(url, "definitely not it");
    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      retryable: false,
    });
  });

  it("AC-1 never revives an expired or revoked session", async () => {
    const first = await signIn(url, PASSWORD_A);
    const second = await signIn(url, PASSWORD_A);
    if (!first.ok || !second.ok) {
      throw new Error("sign in failed in revoke test");
    }
    const ids = await q<{ id: string }>(
      url,
      "SELECT id FROM ledger.session ORDER BY created_at DESC LIMIT 2",
    );

    await q(url, "UPDATE ledger.session SET revoked_at = now() WHERE id = $1", [
      ids[0].id,
    ]);
    await q(
      url,
      "UPDATE ledger.session SET expires_at = now() - interval '1 second' WHERE id = $1",
      [ids[1].id],
    );

    await expect(getSessionByToken(url, first.value.token)).resolves.toEqual({
      ok: true,
      value: null,
    });
    await expect(getSessionByToken(url, second.value.token)).resolves.toEqual({
      ok: true,
      value: null,
    });
  });

  it("AC-1 resolves no session for a token that was never issued", async () => {
    await expect(getSessionByToken(url, "forged-token-value")).resolves.toEqual(
      { ok: true, value: null },
    );
  });

  it("AC-1 set-password refuses to overwrite a hash without --reset", () => {
    let stderr = "";
    try {
      runScript({ DATABASE_URL: url, LEDGER_OWNER_PASSWORD: PASSWORD_B });
    } catch (error) {
      stderr = String((error as { stderr?: unknown }).stderr ?? "");
    }
    expect(stderr).toContain("--reset");
  });

  it("AC-1 set-password --reset replaces the hash and the new password signs in", async () => {
    const out = execFileSync("node", [SCRIPT, "--reset"], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        LEDGER_OWNER_PASSWORD: PASSWORD_B,
      },
      encoding: "utf8",
    });
    expect(out).toContain("owner password updated");
    await expect(signIn(url, PASSWORD_B)).resolves.toMatchObject({ ok: true });
    await expect(signIn(url, PASSWORD_A)).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
  });

  it("AC-1 set-password exits nonzero without DATABASE_URL", () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    let failed = false;
    try {
      execFileSync("node", [SCRIPT], { env, encoding: "utf8" });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it("AC-1 set-password rejects a password under twelve characters", () => {
    let stderr = "";
    try {
      execFileSync("node", [SCRIPT, "--reset"], {
        env: {
          ...process.env,
          DATABASE_URL: url,
          LEDGER_OWNER_PASSWORD: "short",
        },
        encoding: "utf8",
      });
    } catch (error) {
      stderr = String((error as { stderr?: unknown }).stderr ?? "");
    }
    expect(stderr).toContain("at least");
    // Restore a usable hash for the rest of the run.
    return setOwnerPassword(PASSWORD_B);
  });

  it("resolves a concurrent initializeOwner race to the existing owner", async () => {
    const [a, b] = await Promise.all([
      initializeOwner(url, { ownerId: randomUUID(), requestId: randomUUID() }),
      initializeOwner(url, { ownerId: randomUUID(), requestId: randomUUID() }),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.value?.ownerId).toBe(ownerId);
    expect(b.value.value?.ownerId).toBe(ownerId);
    const owners = await q<{ n: string }>(
      url,
      "SELECT COUNT(*) AS n FROM ledger.owner",
    );
    expect(owners[0].n).toBe("1");
  });

  it("AC-3/AC-5 lists owner connections with institution and no token material", async () => {
    const connectionId = await makeConnection(url, ownerId);
    const list = await listOwnerConnections(url, { ownerId });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const mine = list.value.find((c) => c.connectionId === connectionId);
    expect(mine).toMatchObject({
      state: "active",
      institutionName: "Test Bank",
      historyComplete: false,
      lastSuccessfulSyncAt: null,
    });
    expect(JSON.stringify(mine)).not.toContain("ciphertext");
  });

  it("AC-5 reports partial history while a connection lacks complete history", async () => {
    const connectionId = await makeConnection(url, ownerId);
    await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
    });
    const spending = await getMonthlySpending(url, { ownerId });
    expect(spending.ok).toBe(true);
    if (!spending.ok) return;
    // Other connections on the shared owner are also incomplete, so the
    // aggregate can only be partial here.
    expect(spending.value.coverage.historyCompleteness).toBe("partial");
  });

  it("reconciles a provider item to its connection", async () => {
    const providerItemId = `item-${randomUUID()}`;
    const connectionId = await makeConnection(url, ownerId);
    await q(
      url,
      "UPDATE ledger.connection SET provider_item_id = $1 WHERE id = $2",
      [providerItemId, connectionId],
    );
    const found = await findConnectionByProviderItem(url, {
      ownerId,
      providerItemId,
    });
    expect(found).toEqual({
      ok: true,
      value: { connectionId, state: "active" },
    });
    const missing = await findConnectionByProviderItem(url, {
      ownerId,
      providerItemId: `item-${randomUUID()}`,
    });
    expect(missing).toEqual({ ok: true, value: null });
  });

  it("lists owner accounts with exact units after a sync page", async () => {
    const connectionId = await makeConnection(url, ownerId);
    const providerAccountId = `acct-${randomUUID()}`;
    const batch = await applyBatch(url, {
      ownerId,
      connectionId,
      expectedCursor: null,
      accountObservations: [acctObs(providerAccountId)],
    });
    expect(batch.ok).toBe(true);

    const accounts = await listOwnerAccounts(url, { ownerId });
    expect(accounts.ok).toBe(true);
    if (!accounts.ok) return;
    const mine = accounts.value.find(
      (a) => a.name === `Account ${providerAccountId}`,
    );
    expect(mine).toMatchObject({
      connectionId,
      currencyCode: "USD",
      currentUnits: "100000",
      availableUnits: "90000",
      type: "depository",
    });
  });

  it("AC-4/AC-5 marks a committed sync page and bumps the revision", async () => {
    const connectionId = await makeConnection(url, ownerId);
    const before = await getConnectionSyncState(url, { ownerId, connectionId });
    if (!before.ok) throw new Error("no sync state");

    const marked = await markSyncSuccess(url, { ownerId, connectionId });
    expect(marked.ok).toBe(true);

    const after = await getConnectionSyncState(url, { ownerId, connectionId });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(BigInt(after.value.revision)).toBe(
      BigInt(before.value.revision) + 1n,
    );

    const list = await listOwnerConnections(url, { ownerId });
    if (!list.ok) throw new Error("list failed");
    const mine = list.value.find((c) => c.connectionId === connectionId);
    expect(mine?.lastSuccessfulSyncAt).not.toBeNull();
  });

  it("AC-7 decrypts a token for the adapter only while the connection is active", async () => {
    const connectionId = await makeConnection(url, ownerId);
    const plaintext = await decryptConnectionToken(url, {
      ownerId,
      connectionId,
    });
    expect(plaintext.ok).toBe(true);
    if (!plaintext.ok) return;
    expect(plaintext.value.startsWith("token-")).toBe(true);

    const state = await getConnectionSyncState(url, { ownerId, connectionId });
    if (!state.ok) throw new Error("no sync state");
    const disconnected = await setConnectionState(url, {
      ownerId,
      connectionId,
      expectedRevision: state.value.revision,
      targetState: "disconnected",
      requestId: randomUUID(),
    });
    expect(disconnected.ok).toBe(true);

    const after = await decryptConnectionToken(url, { ownerId, connectionId });
    expect(after).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
      retryable: false,
    });
  });
});
