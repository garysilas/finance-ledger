import { z } from "zod";

import { drainConnectionSync } from "@/server/plaid";
import {
  finishWebhookDelivery,
  recordWebhookDelivery,
  resolveOwnerId,
  resolveWebhookConnection,
} from "@/features/finance/webhook-service";
import { markNeedsReconnect } from "@/features/finance/sync-state-service";
import { validateEnv } from "@/server/env";
import { verifyPlaidWebhook } from "@/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The only unauthenticated surface in the app; the Plaid-Verification
// signature is the authentication. Every verified delivery gets a bare
// 200, including duplicates and ignored types. Only signature failure
// rejects, with no detail and nothing logged.

const SYNC_TRIGGER_CODES = new Set([
  "INITIAL_UPDATE",
  "HISTORICAL_UPDATE",
  "DEFAULT_UPDATE",
  "SYNC_UPDATES_AVAILABLE",
]);

const ITEM_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "ITEM_EXPIRED",
  "NO_ACCOUNTS",
  "ITEM_LOCKED",
]);

const webhookBody = z
  .object({
    webhook_type: z.string().min(1).max(128),
    webhook_code: z.string().min(1).max(128),
    webhook_message_id: z.string().min(1).max(256),
    item_id: z.string().min(1).max(256),
    error: z.object({ error_code: z.string().max(128) }).optional(),
  })
  .loose();

function reject(): Response {
  return new Response(null, { status: 401 });
}

async function handle(
  databaseUrl: string,
  body: z.infer<typeof webhookBody>,
): Promise<Response> {
  const connection = await resolveWebhookConnection(databaseUrl, {
    providerItemId: body.item_id,
  });
  if (!connection.ok) {
    return new Response(null, { status: 500 });
  }

  if (connection.value === null) {
    const ownerId = await resolveOwnerId(databaseUrl);
    if (!ownerId.ok || ownerId.value === null) {
      return new Response(null, { status: 500 });
    }
    const recorded = await recordWebhookDelivery(databaseUrl, {
      ownerId: ownerId.value,
      connectionId: null,
      webhookId: body.webhook_message_id,
      webhookType: body.webhook_type,
      webhookCode: body.webhook_code,
      initialOutcome: "rejected",
    });
    return recorded.ok
      ? new Response(null, { status: 200 })
      : new Response(null, { status: 500 });
  }

  const { ownerId, connectionId, state } = connection.value;
  const recorded = await recordWebhookDelivery(databaseUrl, {
    ownerId,
    connectionId,
    webhookId: body.webhook_message_id,
    webhookType: body.webhook_type,
    webhookCode: body.webhook_code,
  });
  if (!recorded.ok) {
    return new Response(null, { status: 500 });
  }
  if (recorded.value.duplicate) {
    return new Response(null, { status: 200 });
  }

  if (
    body.webhook_type === "TRANSACTIONS" &&
    SYNC_TRIGGER_CODES.has(body.webhook_code)
  ) {
    if (state !== "active") {
      await finishWebhookDelivery(databaseUrl, {
        webhookId: body.webhook_message_id,
        outcome: "ignored",
      });
      return new Response(null, { status: 200 });
    }
    const drain = await drainConnectionSync(databaseUrl, {
      ownerId,
      connectionId,
    });
    if (drain.ok) {
      await finishWebhookDelivery(databaseUrl, {
        webhookId: body.webhook_message_id,
        outcome: "applied",
      });
    } else if (drain.code === "SYNC_IN_PROGRESS") {
      await finishWebhookDelivery(databaseUrl, {
        webhookId: body.webhook_message_id,
        outcome: "duplicate",
      });
    }
    // Any other failure leaves the row in received, the marker for a
    // delivery whose sync never ran.
    return new Response(null, { status: 200 });
  }

  if (
    body.webhook_type === "ITEM" &&
    body.error !== undefined &&
    ITEM_ERROR_CODES.has(body.error.error_code)
  ) {
    const marked = await markNeedsReconnect(databaseUrl, {
      ownerId,
      connectionId,
    });
    await finishWebhookDelivery(databaseUrl, {
      webhookId: body.webhook_message_id,
      outcome: marked.ok ? "applied" : "ignored",
    });
    return new Response(null, { status: 200 });
  }

  await finishWebhookDelivery(databaseUrl, {
    webhookId: body.webhook_message_id,
    outcome: "ignored",
  });
  return new Response(null, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get("plaid-verification");
  if (token === null) {
    return reject();
  }
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const verified = await verifyPlaidWebhook(rawBody, token);
  if (!verified.ok) {
    return reject();
  }
  let parsed: z.infer<typeof webhookBody>;
  try {
    const candidate = webhookBody.safeParse(
      JSON.parse(new TextDecoder().decode(rawBody)),
    );
    if (!candidate.success) {
      // Verified signature over an unusable body: nothing to record,
      // nothing to retry.
      return new Response(null, { status: 200 });
    }
    parsed = candidate.data;
  } catch {
    return new Response(null, { status: 200 });
  }

  const env = validateEnv();
  if (!env.ok) {
    return new Response(null, { status: 500 });
  }
  return handle(env.config.databaseUrl, parsed);
}
