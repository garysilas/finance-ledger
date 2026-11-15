"use server";

import { z } from "zod";

import { disconnectConnection } from "@/features/finance/connection-service";
import type { FailureCode } from "@/features/finance/errors";
import { markReconnectSucceeded } from "@/features/finance/sync-state-service";
import { validateEnv } from "@/server/env";
import {
  drainConnectionSync,
  plaidConfirmItemHealthy,
  plaidUpdateModeLinkToken,
} from "@/server/plaid";
import { requireSession } from "@/server/session";

export type ActionCode = FailureCode | "SESSION";

type SessionContext = {
  databaseUrl: string;
  ownerId: string;
};

// Every action revalidates the session itself; the proxy cookie check is
// only a redirect, never authorization.
async function sessionContext(): Promise<SessionContext | ActionCode> {
  const env = validateEnv();
  if (!env.ok) {
    return "CONFIG_INVALID";
  }
  const session = await requireSession(env.config.databaseUrl);
  if (session === null) {
    return "SESSION";
  }
  return { databaseUrl: env.config.databaseUrl, ownerId: session.ownerId };
}

const connectionIdSchema = z.string().uuid();

export type SyncResult =
  | {
      ok: true;
      pages: number;
      counts: { inserted: number; updated: number; removed: number };
    }
  | { ok: false; code: ActionCode };

export async function syncConnectionAction(
  rawConnectionId: string,
): Promise<SyncResult> {
  const context = await sessionContext();
  if (typeof context === "string") {
    return { ok: false, code: context };
  }
  const parsed = connectionIdSchema.safeParse(rawConnectionId);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  const drain = await drainConnectionSync(context.databaseUrl, {
    ownerId: context.ownerId,
    connectionId: parsed.data,
  });
  if (!drain.ok) {
    return { ok: false, code: drain.code };
  }
  return { ok: true, pages: drain.value.pages, counts: drain.value.counts };
}

export type LinkTokenResult =
  { ok: true; linkToken: string } | { ok: false; code: ActionCode };

// Update mode Link token for a needs_reconnect connection; the existing
// item token is bound inside the adapter and never leaves the server.
export async function createReconnectLinkTokenAction(
  rawConnectionId: string,
): Promise<LinkTokenResult> {
  const context = await sessionContext();
  if (typeof context === "string") {
    return { ok: false, code: context };
  }
  const parsed = connectionIdSchema.safeParse(rawConnectionId);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  const token = await plaidUpdateModeLinkToken(context.databaseUrl, {
    ownerId: context.ownerId,
    connectionId: parsed.data,
  });
  if (!token.ok) {
    return { ok: false, code: token.code };
  }
  return { ok: true, linkToken: token.value };
}

// Complete reconnect: /item/get must confirm the provider cleared the
// item error before the connection returns to active. A client reported
// Link success alone never flips the state.
export async function completeReconnectAction(
  rawConnectionId: string,
): Promise<{ ok: true } | { ok: false; code: ActionCode }> {
  const context = await sessionContext();
  if (typeof context === "string") {
    return { ok: false, code: context };
  }
  const parsed = connectionIdSchema.safeParse(rawConnectionId);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  const ref = { ownerId: context.ownerId, connectionId: parsed.data };
  const healthy = await plaidConfirmItemHealthy(context.databaseUrl, ref);
  if (!healthy.ok) {
    return { ok: false, code: healthy.code };
  }
  const restored = await markReconnectSucceeded(context.databaseUrl, ref);
  if (!restored.ok) {
    return { ok: false, code: restored.code };
  }
  return { ok: true };
}

// Disconnect keeps stored accounts and transactions, marks them no
// longer updating, and clears the token envelope in one unit of work.
export async function disconnectConnectionAction(
  rawConnectionId: string,
): Promise<{ ok: true } | { ok: false; code: ActionCode }> {
  const context = await sessionContext();
  if (typeof context === "string") {
    return { ok: false, code: context };
  }
  const parsed = connectionIdSchema.safeParse(rawConnectionId);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  const result = await disconnectConnection(context.databaseUrl, {
    ownerId: context.ownerId,
    connectionId: parsed.data,
  });
  if (!result.ok) {
    return { ok: false, code: result.code };
  }
  return { ok: true };
}
