import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/plaid", () => ({
  drainConnectionSync: vi.fn(),
}));
vi.mock("@/features/finance/webhook-service", () => ({
  finishWebhookDelivery: vi.fn(),
  recordWebhookDelivery: vi.fn(),
  resolveOwnerId: vi.fn(),
  resolveWebhookConnection: vi.fn(),
}));
vi.mock("@/features/finance/sync-state-service", () => ({
  markNeedsReconnect: vi.fn(),
}));
vi.mock("@/server/env", () => ({
  validateEnv: vi.fn(),
}));
vi.mock("@/server/webhook", () => ({
  verifyPlaidWebhook: vi.fn(),
}));

import { drainConnectionSync } from "@/server/plaid";
import {
  finishWebhookDelivery,
  recordWebhookDelivery,
  resolveWebhookConnection,
} from "@/features/finance/webhook-service";
import { validateEnv } from "@/server/env";
import { verifyPlaidWebhook } from "@/server/webhook";
import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://127.0.0.1:3000/api/webhooks/plaid", {
    method: "POST",
    headers: { "plaid-verification": "token" },
    body: JSON.stringify(body),
  });
}

const REAL_PAYLOAD = {
  webhook_type: "TRANSACTIONS",
  webhook_code: "SYNC_UPDATES_AVAILABLE",
  webhook_message_id: "wh_1",
  item_id: "item_1",
};

beforeEach(() => {
  vi.mocked(verifyPlaidWebhook).mockResolvedValue({ ok: true } as never);
  vi.mocked(validateEnv).mockReturnValue({
    ok: true,
    config: { databaseUrl: "postgresql://x" },
  } as never);
  vi.mocked(resolveWebhookConnection).mockResolvedValue({
    ok: true,
    value: { ownerId: "o1", connectionId: "c1", state: "active" },
  } as never);
  vi.mocked(recordWebhookDelivery).mockResolvedValue({
    ok: true,
    value: { duplicate: false },
  } as never);
  vi.mocked(drainConnectionSync).mockResolvedValue({ ok: true } as never);
  vi.mocked(finishWebhookDelivery).mockResolvedValue({ ok: true } as never);
});

describe("POST /api/webhooks/plaid", () => {
  it("records a verified delivery keyed on webhook_message_id", async () => {
    const response = await POST(request(REAL_PAYLOAD));
    expect(response.status).toBe(200);
    expect(recordWebhookDelivery).toHaveBeenCalledWith(
      "postgresql://x",
      expect.objectContaining({
        webhookId: "wh_1",
        webhookType: "TRANSACTIONS",
        webhookCode: "SYNC_UPDATES_AVAILABLE",
      }),
    );
    expect(drainConnectionSync).toHaveBeenCalled();
    expect(finishWebhookDelivery).toHaveBeenCalledWith(
      "postgresql://x",
      expect.objectContaining({ webhookId: "wh_1", outcome: "applied" }),
    );
  });

  it("does not record a verified body missing webhook_message_id", async () => {
    const legacyShape: Record<string, unknown> = { ...REAL_PAYLOAD };
    delete legacyShape.webhook_message_id;
    const response = await POST(
      request({ ...legacyShape, webhook_id: "wh_1" }),
    );
    expect(response.status).toBe(200);
    expect(recordWebhookDelivery).not.toHaveBeenCalled();
  });
});
