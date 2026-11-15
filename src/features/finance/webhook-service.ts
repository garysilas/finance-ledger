import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { failure, type ServiceResult } from "./errors";
import { idText, uuid } from "./service";
import { runUnitOfWork, OpFailure } from "@/server/db/finance";

export const WEBHOOK_OUTCOMES = [
  "received",
  "applied",
  "duplicate",
  "ignored",
  "rejected",
] as const;
export type WebhookOutcome = (typeof WEBHOOK_OUTCOMES)[number];

export type WebhookConnection = {
  ownerId: string;
  connectionId: string;
  state: string;
};

// Resolve a verified payload's provider item to its connection. The
// webhook is the only unauthenticated surface, so resolution happens by
// provider_item_id alone; owner scoping resumes inside the services it
// calls next.
export async function resolveWebhookConnection(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<WebhookConnection | null>> {
  const parsed = z
    .object({ providerItemId: idText })
    .strict()
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { providerItemId } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{
      id: string;
      owner_id: string;
      state: string;
    }>(
      `SELECT id, owner_id, state FROM ledger.connection
       WHERE provider_item_id = $1`,
      [providerItemId],
    );
    const row = rows.rows[0];
    return row === undefined
      ? null
      : { ownerId: row.owner_id, connectionId: row.id, state: row.state };
  });
}

// The singleton owner id, needed to file a delivery whose item never
// resolved to a connection.
export async function resolveOwnerId(
  databaseUrl: string,
): Promise<ServiceResult<string | null>> {
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query<{ id: string }>("SELECT id FROM ledger.owner");
    return rows.rows[0]?.id ?? null;
  });
}

const deliveryInput = z
  .object({
    ownerId: uuid,
    connectionId: uuid.nullable(),
    webhookId: idText,
    webhookType: idText,
    webhookCode: idText,
    initialOutcome: z.enum(["received", "rejected"]).default("received"),
  })
  .strict();

export type DeliveryRecord = {
  duplicate: boolean;
};

// Record a verified delivery keyed on webhook_id. The unique constraint
// is the dedup: a repeat delivery marks the stored row duplicate and
// reports duplicate so no second sync ever runs.
export async function recordWebhookDelivery(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<DeliveryRecord>> {
  const parsed = deliveryInput.safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const input = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO ledger.webhook_delivery
         (id, owner_id, connection_id, webhook_id, webhook_type,
          webhook_code, outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (webhook_id) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        input.ownerId,
        input.connectionId,
        input.webhookId,
        input.webhookType,
        input.webhookCode,
        input.initialOutcome,
      ],
    );
    if (inserted.rows.length > 0) {
      return { duplicate: false };
    }
    await db.query(
      `UPDATE ledger.webhook_delivery
       SET outcome = 'duplicate', received_at = now()
       WHERE webhook_id = $1 AND outcome <> 'received'`,
      [input.webhookId],
    );
    return { duplicate: true };
  });
}

// Close a delivery once its handling finishes. Rows left in received
// mark deliveries whose sync never ran, visible in health checks.
export async function finishWebhookDelivery(
  databaseUrl: string,
  rawInput: unknown,
): Promise<ServiceResult<null>> {
  const parsed = z
    .object({
      webhookId: idText,
      outcome: z.enum(["applied", "ignored", "rejected", "duplicate"]),
    })
    .strict()
    .safeParse(rawInput);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }
  const { webhookId, outcome } = parsed.data;
  return runUnitOfWork(databaseUrl, async (db) => {
    const rows = await db.query(
      `UPDATE ledger.webhook_delivery
       SET outcome = $2
       WHERE webhook_id = $1
       RETURNING id`,
      [webhookId, outcome],
    );
    if (rows.rows.length === 0) {
      throw new OpFailure("NOT_FOUND");
    }
    return null;
  });
}
