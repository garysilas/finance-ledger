import { createHash } from "node:crypto";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/plaid", () => ({
  plaidWebhookVerificationKey: vi.fn(),
}));

import { verifyPlaidWebhook } from "./webhook";
import { vi } from "vitest";

const KID = "test-kid-1";
const { publicKey, privateKey } = await generateKeyPair("ES256", {
  extractable: true,
});

async function fetchTestKey(keyId: string) {
  if (keyId !== KID) {
    return {
      ok: false as const,
      code: "PROVIDER_UNAVAILABLE" as const,
      retryable: true,
    };
  }
  const jwk = (await exportJWK(publicKey)) as Record<string, unknown>;
  return { ok: true as const, value: jwk };
}

const BODY = new TextEncoder().encode(
  JSON.stringify({
    webhook_type: "TRANSACTIONS",
    webhook_code: "SYNC_UPDATES_AVAILABLE",
    webhook_message_id: "wh_1",
    item_id: "item_1",
  }),
);

async function sign(
  body: Uint8Array = BODY,
  claims: Record<string, unknown> = {},
  kid: string | null = KID,
) {
  const digest = createHash("sha256").update(body).digest("hex");
  const jwt = new SignJWT({
    request_body_sha256: digest,
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", ...(kid !== null ? { kid } : {}) })
    .setIssuedAt();
  return jwt.sign(privateKey);
}

describe("verifyPlaidWebhook", () => {
  it("accepts a correctly signed JWT bound to the raw body", async () => {
    const token = await sign();
    const result = await verifyPlaidWebhook(BODY, token, fetchTestKey);
    expect(result.ok).toBe(true);
  });

  it("rejects a body that does not match the bound hash", async () => {
    const token = await sign();
    const other = new TextEncoder().encode(JSON.stringify({ tampered: 1 }));
    const result = await verifyPlaidWebhook(other, token, fetchTestKey);
    expect(result.ok).toBe(false);
  });

  it("rejects a token signed by a different key", async () => {
    const otherPair = await generateKeyPair("ES256");
    const digest = createHash("sha256").update(BODY).digest("hex");
    const token = await new SignJWT({ request_body_sha256: digest })
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setIssuedAt()
      .sign(otherPair.privateKey);
    const result = await verifyPlaidWebhook(BODY, token, fetchTestKey);
    expect(result.ok).toBe(false);
  });

  it("rejects a missing kid header", async () => {
    const token = await sign(BODY, {}, null);
    const result = await verifyPlaidWebhook(BODY, token, fetchTestKey);
    expect(result.ok).toBe(false);
  });

  it("rejects when the key endpoint cannot supply the kid", async () => {
    const token = await sign(BODY, {}, "unknown-kid");
    const result = await verifyPlaidWebhook(BODY, token, fetchTestKey);
    expect(result.ok).toBe(false);
  });
});
