"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  createConnection,
  findConnectionByProviderItem,
} from "@/features/finance/connection-service";
import type { FailureCode } from "@/features/finance/errors";
import { uuid } from "@/features/finance/service";
import { validateEnv } from "@/server/env";
import {
  drainConnectionSync,
  plaidCreateLinkToken,
  plaidExchangePublicToken,
  plaidLookupInstitution,
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

export type LinkTokenResult =
  { ok: true; linkToken: string } | { ok: false; code: ActionCode };

// A fresh link token for each Link open; client_user_id is the internal
// owner UUID, never the session token.
export async function createLinkTokenAction(): Promise<LinkTokenResult> {
  const context = await sessionContext();
  if (typeof context === "string") {
    return { ok: false, code: context };
  }
  const token = await plaidCreateLinkToken(context.ownerId);
  if (!token.ok) {
    return { ok: false, code: token.code };
  }
  return { ok: true, linkToken: token.value };
}

export type CompleteStage = "exchange" | "institution" | "connection" | "sync";

export type CompleteResult =
  | { ok: true; connectionId: string }
  | {
      ok: false;
      stage: CompleteStage;
      code: ActionCode;
      connectionId?: string;
    };

const publicTokenSchema = z.string().min(1).max(1024);

// Exchange, encrypted connection, institution lookup done earlier (the
// institution call needs the access token), then the sync drain. Each
// stage that commits stays committed; a failure reports where to resume.
// A public token is single use, so failures before the connection commits
// can only be retried by reopening Link.
export async function completeConnectionAction(
  rawPublicToken: string,
): Promise<CompleteResult> {
  const context = await sessionContext();
  if (typeof context === "string") {
    return { ok: false, stage: "exchange", code: context };
  }
  const parsed = publicTokenSchema.safeParse(rawPublicToken);
  if (!parsed.success) {
    return { ok: false, stage: "exchange", code: "INVALID_INPUT" };
  }

  const exchange = await plaidExchangePublicToken(parsed.data);
  if (!exchange.ok) {
    return { ok: false, stage: "exchange", code: exchange.code };
  }
  const { accessToken, itemId } = exchange.value;

  const institution = await plaidLookupInstitution(accessToken);
  if (!institution.ok) {
    return { ok: false, stage: "institution", code: institution.code };
  }

  const created = await createConnection(context.databaseUrl, {
    ownerId: context.ownerId,
    provider: "plaid",
    environment: "sandbox",
    providerItemId: itemId,
    institutionId: institution.value.institutionId,
    institutionName: institution.value.institutionName,
    tokenPlaintext: accessToken,
    requestId: randomUUID(),
  });

  let connectionId: string | null = created.ok
    ? (created.value.value?.connectionId ?? null)
    : null;
  if (connectionId === null) {
    if (created.ok || created.code !== "CONFLICT") {
      return {
        ok: false,
        stage: "connection",
        code: created.ok ? "INTERNAL_FAILURE" : created.code,
      };
    }
    // A re-run hits the provider item unique constraint; reconcile to the
    // existing connection rather than duplicating it.
    const existing = await findConnectionByProviderItem(context.databaseUrl, {
      ownerId: context.ownerId,
      providerItemId: itemId,
    });
    if (!existing.ok || existing.value === null) {
      return { ok: false, stage: "connection", code: "CONFLICT" };
    }
    connectionId = existing.value.connectionId;
  }

  const sync = await drainConnectionSync(context.databaseUrl, {
    ownerId: context.ownerId,
    connectionId,
  });
  if (!sync.ok) {
    return {
      ok: false,
      stage: "sync",
      code: sync.code,
      connectionId,
    };
  }
  return { ok: true, connectionId };
}

export type RetryResult = { ok: true } | { ok: false; code: ActionCode };

export async function retryInitialSyncAction(
  rawConnectionId: string,
): Promise<RetryResult> {
  const context = await sessionContext();
  if (typeof context === "string") {
    return { ok: false, code: context };
  }
  const parsed = uuid.safeParse(rawConnectionId);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  const sync = await drainConnectionSync(context.databaseUrl, {
    ownerId: context.ownerId,
    connectionId: parsed.data,
  });
  if (!sync.ok) {
    return { ok: false, code: sync.code };
  }
  return { ok: true };
}
