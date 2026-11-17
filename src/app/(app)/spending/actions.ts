"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CLASSIFICATIONS } from "@/features/finance/classification";
import {
  createConnection,
  findConnectionByProviderItem,
} from "@/features/finance/connection-service";
import type { FailureCode } from "@/features/finance/errors";
import {
  setTransactionOverrides,
  type SetOverridesResult,
} from "@/features/finance/override-service";
import { uuid } from "@/features/finance/service";
import {
  CURSOR_PATTERN,
  SEARCH_MAX_LENGTH,
  UNCATEGORIZED_PARAM,
  type TransactionPage,
  type TransactionRow,
} from "@/features/finance/transaction-params";
import {
  getTransaction,
  listMonthTransactions,
} from "@/features/finance/transaction-service";
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

const pageSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    categoryId: z.union([uuid, z.literal(UNCATEGORIZED_PARAM)]).optional(),
    accountId: uuid.optional(),
    query: z.string().max(SEARCH_MAX_LENGTH).optional(),
    showExcluded: z.boolean(),
    cursor: z.string().regex(CURSOR_PATTERN).optional(),
  })
  .strict();

export type PageResult =
  { ok: true; page: TransactionPage } | { ok: false; code: ActionCode };

// Load more for the transaction table. The owner always comes from the
// session, never from the caller.
export async function fetchTransactionPage(
  rawInput: unknown,
): Promise<PageResult> {
  const context = await sessionContext();
  if (typeof context === "string") {
    return { ok: false, code: context };
  }
  const parsed = pageSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  const result = await listMonthTransactions(context.databaseUrl, {
    ownerId: context.ownerId,
    ...parsed.data,
  });
  if (!result.ok) {
    return { ok: false, code: result.code };
  }
  return { ok: true, page: result.value };
}

const updateSchema = z
  .object({
    transactionId: uuid,
    expectedOwnerEditRevision: z.string().regex(/^\d{1,19}$/),
    categoryId: uuid.nullable().optional(),
    classification: z.enum(CLASSIFICATIONS).nullable().optional(),
    requestId: uuid,
  })
  .strict()
  .refine(
    (value) =>
      value.categoryId !== undefined || value.classification !== undefined,
  );

export type UpdateResult =
  // A replayed request id acknowledges the original edit without its
  // values (value absent); the revalidated page carries the current ones.
  | { ok: true; value?: SetOverridesResult }
  | { ok: false; code: ActionCode; row?: TransactionRow };

// Edits one live row's category or classification through the override
// service (revision checked, receipt and audit written). A conflict
// returns the row's current values, or its posted replacement's, so the
// owner can retry on fresh data. Success and conflict both revalidate the
// page, so loaded pages and every total refresh together.
export async function updateTransaction(
  rawInput: unknown,
): Promise<UpdateResult> {
  const context = await sessionContext();
  if (typeof context === "string") {
    return { ok: false, code: context };
  }
  const parsed = updateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  const result = await setTransactionOverrides(context.databaseUrl, {
    ownerId: context.ownerId,
    ...parsed.data,
  });
  if (result.ok) {
    revalidatePath("/spending");
    return { ok: true, value: result.value.value };
  }
  if (result.code !== "CONFLICT") {
    return { ok: false, code: result.code };
  }
  revalidatePath("/spending");
  const fresh = await getTransaction(context.databaseUrl, {
    ownerId: context.ownerId,
    transactionId: result.successorId ?? parsed.data.transactionId,
  });
  return {
    ok: false,
    code: "CONFLICT",
    row: fresh.ok ? fresh.value : undefined,
  };
}
