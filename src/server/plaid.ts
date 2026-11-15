import "server-only";

import { randomUUID } from "node:crypto";
import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type AccountBase,
  type Transaction,
  type TransactionsSyncResponse,
} from "plaid";
import { z } from "zod";

import { mapPlaidCategory } from "@/features/finance/category-map";
import { parseCalendarDate } from "@/features/finance/dates";
import {
  failure,
  ok,
  type FailureCode,
  type ServiceResult,
} from "@/features/finance/errors";
import { parseMoneyToUnits } from "@/features/finance/money";
import { applyProviderBatch } from "@/features/finance/batch-service";
import {
  decryptConnectionToken,
  decryptReconnectToken,
} from "@/features/finance/connection-service";
import {
  claimSyncRun,
  failSyncRun,
  finishSyncRun,
  markNeedsReconnect,
} from "@/features/finance/sync-state-service";

// The trusted provider adapter. It is the only module allowed to call
// decryptConnectionToken and getConnectionSyncState; plaintext access
// tokens exist only inside these functions and never reach display
// values, logs, or action results.

const plaidSettings = z.object({
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1),
  PLAID_ENV: z.literal("sandbox"),
  PLAID_WEBHOOK_URL: z.string().url().optional(),
});

type PlaidConfig = {
  clientId: string;
  secret: string;
  webhookUrl: string | null;
};

// Lazy validation, same contract as loadTokenKey: Plaid actions fail
// closed on missing or wrong settings while builds and reads never need
// them.
export function loadPlaidSettings(
  source: NodeJS.ProcessEnv = process.env,
): ServiceResult<PlaidConfig> {
  const parsed = plaidSettings.safeParse({
    PLAID_CLIENT_ID: source.PLAID_CLIENT_ID,
    PLAID_SECRET: source.PLAID_SECRET,
    PLAID_ENV: source.PLAID_ENV,
    PLAID_WEBHOOK_URL: source.PLAID_WEBHOOK_URL,
  });
  if (!parsed.success) {
    return failure("CONFIG_INVALID");
  }
  return ok({
    clientId: parsed.data.PLAID_CLIENT_ID,
    secret: parsed.data.PLAID_SECRET,
    webhookUrl: parsed.data.PLAID_WEBHOOK_URL ?? null,
  });
}

function plaidClient(config: PlaidConfig): PlaidApi {
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": config.clientId,
          "PLAID-SECRET": config.secret,
        },
      },
    }),
  );
}

// Plaid error codes that mean the caller input, not the provider, failed.
function isInvalidPublicToken(error: unknown): boolean {
  const code = (error as { response?: { data?: { error_code?: string } } })
    ?.response?.data?.error_code;
  return code === "INVALID_PUBLIC_TOKEN";
}

export async function plaidCreateLinkToken(
  ownerId: string,
): Promise<ServiceResult<string>> {
  const settings = loadPlaidSettings();
  if (!settings.ok) {
    return settings;
  }
  try {
    const response = await plaidClient(settings.value).linkTokenCreate({
      client_name: "Ledger",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: ownerId },
      products: [Products.Transactions],
      ...(settings.value.webhookUrl !== null
        ? { webhook: settings.value.webhookUrl }
        : {}),
    });
    return ok(response.data.link_token);
  } catch {
    return failure("PROVIDER_UNAVAILABLE");
  }
}

export type PlaidExchange = {
  accessToken: string;
  itemId: string;
};

export async function plaidExchangePublicToken(
  publicToken: string,
): Promise<ServiceResult<PlaidExchange>> {
  const settings = loadPlaidSettings();
  if (!settings.ok) {
    return settings;
  }
  try {
    const response = await plaidClient(settings.value).itemPublicTokenExchange({
      public_token: publicToken,
    });
    return ok({
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    });
  } catch (error) {
    if (isInvalidPublicToken(error)) {
      return failure("INVALID_INPUT");
    }
    return failure("PROVIDER_UNAVAILABLE");
  }
}

export type PlaidInstitution = {
  institutionId: string | null;
  institutionName: string | null;
};

// Institution identity comes from the item and institutions endpoints;
// Link metadata is display only and never trusted.
export async function plaidLookupInstitution(
  accessToken: string,
): Promise<ServiceResult<PlaidInstitution>> {
  const settings = loadPlaidSettings();
  if (!settings.ok) {
    return settings;
  }
  const client = plaidClient(settings.value);
  try {
    const item = await client.itemGet({ access_token: accessToken });
    const institutionId = item.data.item.institution_id ?? null;
    if (institutionId === null) {
      return ok({ institutionId: null, institutionName: null });
    }
    const institution = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us],
    });
    return ok({
      institutionId,
      institutionName: institution.data.institution.name,
    });
  } catch {
    return failure("PROVIDER_UNAVAILABLE");
  }
}

export type NormalizedSyncPage = {
  accountObservations: Record<string, unknown>[];
  transactionUpserts: Record<string, unknown>[];
  removalIds: string[];
  nextCursor: string;
};

// Exact decimal string for a JSON number. String() preserves the parsed
// decimal exactly; scientific notation or extra precision fails the money
// parse rather than rounding.
function decimalString(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function calendarDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const candidate = value.slice(0, 10);
  return parseCalendarDate(candidate) === null ? null : candidate;
}

function mapTransaction(txn: Transaction): Record<string, unknown> {
  const currency = txn.iso_currency_code;
  if (currency !== "USD") {
    throw new SyncInputFailure("UNSUPPORTED_MONEY");
  }
  const amount = decimalString(txn.amount);
  if (amount === null) {
    throw new SyncInputFailure("INVALID_INPUT");
  }
  const parsed = parseMoneyToUnits(amount, currency);
  if (!parsed.ok) {
    throw new SyncInputFailure(parsed.code);
  }
  const primary = txn.personal_finance_category?.primary ?? null;
  const detailed = txn.personal_finance_category?.detailed ?? null;
  const category = mapPlaidCategory(primary, detailed, parsed.value.units);
  const providerDate = calendarDate(txn.date);
  if (providerDate === null) {
    throw new SyncInputFailure("INVALID_INPUT");
  }
  const authorizedDate =
    calendarDate(txn.authorized_datetime) ?? calendarDate(txn.datetime);
  return {
    providerTransactionId: txn.transaction_id,
    providerAccountId: txn.account_id,
    amount,
    currencyCode: currency,
    postingState: txn.pending ? "pending" : "posted",
    providerDate,
    postedDate: txn.pending ? null : providerDate,
    authorizedDate,
    providerPendingTransactionId: txn.pending_transaction_id ?? null,
    description: txn.name,
    merchantName: txn.merchant_name ?? null,
    providerCategoryCode: detailed ?? primary,
    providerCategoryStableKey: category.stableKey,
    providerClassification: category.classification,
  };
}

function mapAccount(account: AccountBase): Record<string, unknown> {
  const balances = account.balances;
  return {
    providerAccountId: account.account_id,
    name: account.name,
    officialName: account.official_name ?? null,
    type: account.type,
    subtype: account.subtype ?? null,
    currencyCode:
      balances.iso_currency_code ?? balances.unofficial_currency_code ?? null,
    current: decimalString(balances.current),
    available: decimalString(balances.available),
    creditLimit: decimalString(balances.limit),
    balanceObservedAt: new Date().toISOString(),
  };
}

export class SyncInputFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
  }
}

// Normalize one /transactions/sync page into batch inputs. Anything that
// cannot convert exactly fails the whole page so the cursor never advances
// over unwritten or rounded data.
export function normalizeSyncPage(
  data: TransactionsSyncResponse,
): ServiceResult<NormalizedSyncPage> {
  try {
    const upserts = [...data.added, ...data.modified].map(mapTransaction);
    const removalIds = data.removed
      .map((entry) => entry.transaction_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    return ok({
      accountObservations: data.accounts.map(mapAccount),
      transactionUpserts: upserts,
      removalIds,
      nextCursor: data.next_cursor,
    });
  } catch (error) {
    if (error instanceof SyncInputFailure) {
      return failure(error.code);
    }
    return failure("INTERNAL_FAILURE");
  }
}

// Item errors that mean the owner must reconnect through Link update
// mode. Anything else from the provider is treated as transient.
const ITEM_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "ITEM_EXPIRED",
  "NO_ACCOUNTS",
  "ITEM_LOCKED",
]);

function plaidErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { error_code?: string } } })
    ?.response?.data?.error_code;
  return typeof code === "string" ? code : null;
}

async function plaidTransactionsSync(
  accessToken: string,
  cursor: string | null,
): Promise<ServiceResult<TransactionsSyncResponse>> {
  const settings = loadPlaidSettings();
  if (!settings.ok) {
    return settings;
  }
  try {
    const response = await plaidClient(settings.value).transactionsSync({
      access_token: accessToken,
      cursor: cursor ?? "",
    });
    return ok(response.data);
  } catch (error) {
    const code = plaidErrorCode(error);
    if (code !== null && ITEM_ERROR_CODES.has(code)) {
      return failure("NEEDS_RECONNECT");
    }
    return failure("PROVIDER_UNAVAILABLE");
  }
}

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Individual Plaid calls retry up to 3 attempts with a 250 ms base delay
// doubling per attempt. Only PROVIDER_UNAVAILABLE retries; item errors
// and validation failures are terminal.
async function withRetry<T>(
  call: () => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  let attempt = 0;
  for (;;) {
    const result = await call();
    if (result.ok || result.code !== "PROVIDER_UNAVAILABLE") {
      return result;
    }
    attempt += 1;
    if (attempt >= RETRY_ATTEMPTS) {
      return result;
    }
    await delay(RETRY_BASE_MS * 2 ** (attempt - 1));
  }
}

export type DrainSyncOutcome = {
  connectionId: string;
  cursor: string;
  pages: number;
  counts: { inserted: number; updated: number; removed: number };
};

// Drain every /transactions/sync page for a connection. The claim makes
// one runner per connection; each page commits atomically through
// applyProviderBatch and the cursor advances only on commit, so a mid run
// failure keeps committed pages and the next run resumes from them. A
// finished drain sets history_complete: a non null cursor implies every
// earlier page committed, so reaching the end means the whole chain is
// stored regardless of where this run began.
export async function drainConnectionSync(
  databaseUrl: string,
  input: { ownerId: string; connectionId: string },
): Promise<ServiceResult<DrainSyncOutcome>> {
  const claim = await claimSyncRun(databaseUrl, input);
  if (!claim.ok) {
    return claim;
  }
  const ref = { ownerId: input.ownerId, connectionId: input.connectionId };

  const fail = async (code: FailureCode) => {
    await failSyncRun(databaseUrl, { ...ref, code });
    return failure(code);
  };

  const token = await decryptConnectionToken(databaseUrl, ref);
  if (!token.ok) {
    return fail(token.code);
  }

  // Existing connections adopt the configured webhook URL before the
  // drain. A failure there never fails the sync.
  const settings = loadPlaidSettings();
  if (settings.ok && settings.value.webhookUrl !== null) {
    await plaidItemWebhookUpdate(token.value, settings.value.webhookUrl);
  }

  let cursor = claim.value.cursor;
  const counts = { inserted: 0, updated: 0, removed: 0 };
  let pages = 0;

  for (;;) {
    const page = await withRetry(() =>
      plaidTransactionsSync(token.value, cursor),
    );
    if (!page.ok) {
      if (page.code === "NEEDS_RECONNECT") {
        await markNeedsReconnect(databaseUrl, ref);
        return failure("NEEDS_RECONNECT");
      }
      return fail(page.code);
    }
    const normalized = normalizeSyncPage(page.value);
    if (!normalized.ok) {
      return fail(normalized.code);
    }
    const batch = await applyProviderBatch(databaseUrl, {
      ...ref,
      expectedCursor: cursor,
      nextCursor: normalized.value.nextCursor,
      accountObservations: normalized.value.accountObservations,
      transactionUpserts: normalized.value.transactionUpserts,
      removalIds: normalized.value.removalIds,
      requestId: randomUUID(),
    });
    if (!batch.ok) {
      return fail(batch.code);
    }
    pages += 1;
    counts.inserted += batch.value.counts.inserted;
    counts.updated += batch.value.counts.updated;
    counts.removed += batch.value.counts.removed;
    cursor = normalized.value.nextCursor;
    if (!page.value.has_more) {
      break;
    }
  }

  const finished = await finishSyncRun(databaseUrl, {
    ...ref,
    historyComplete: true,
  });
  if (!finished.ok) {
    return finished;
  }
  return ok({
    connectionId: input.connectionId,
    cursor,
    pages,
    counts,
  });
}

// Update mode Link token: bound to the item's existing access token, no
// products argument, same webhook URL. The resulting public token is
// never exchanged because update mode returns no new item.
export async function plaidCreateUpdateLinkToken(
  accessToken: string,
  ownerId: string,
): Promise<ServiceResult<string>> {
  const settings = loadPlaidSettings();
  if (!settings.ok) {
    return settings;
  }
  try {
    const response = await plaidClient(settings.value).linkTokenCreate({
      client_name: "Ledger",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: ownerId },
      access_token: accessToken,
      ...(settings.value.webhookUrl !== null
        ? { webhook: settings.value.webhookUrl }
        : {}),
    });
    return ok(response.data.link_token);
  } catch {
    return failure("PROVIDER_UNAVAILABLE");
  }
}

// The item's current error code, or null when the provider reports the
// item healthy. Used after Link update mode before a connection may
// return to active.
export async function plaidItemError(
  accessToken: string,
): Promise<ServiceResult<string | null>> {
  const settings = loadPlaidSettings();
  if (!settings.ok) {
    return settings;
  }
  try {
    const response = await plaidClient(settings.value).itemGet({
      access_token: accessToken,
    });
    return ok(response.data.item.error?.error_code ?? null);
  } catch {
    return failure("PROVIDER_UNAVAILABLE");
  }
}

// Update mode link token for a needs_reconnect connection: the token is
// decrypted inside the adapter and bound to the existing item, so the
// browser only ever sees the short lived link token.
export async function plaidUpdateModeLinkToken(
  databaseUrl: string,
  input: { ownerId: string; connectionId: string },
): Promise<ServiceResult<string>> {
  const token = await decryptReconnectToken(databaseUrl, input);
  if (!token.ok) {
    return token;
  }
  return plaidCreateUpdateLinkToken(token.value, input.ownerId);
}

// After Link update mode completes, confirm through /item/get that the
// provider cleared the item error. Client reported success alone is
// never trusted.
export async function plaidConfirmItemHealthy(
  databaseUrl: string,
  input: { ownerId: string; connectionId: string },
): Promise<ServiceResult<null>> {
  const token = await decryptReconnectToken(databaseUrl, input);
  if (!token.ok) {
    return token;
  }
  const itemError = await withRetry(() => plaidItemError(token.value));
  if (!itemError.ok) {
    return itemError;
  }
  if (itemError.value !== null) {
    return failure("ITEM_STILL_ERROR");
  }
  return ok(null);
}

// Repoint the item's webhook to the configured URL. Called before a drain
// for connections created before webhook registration existed.
export async function plaidItemWebhookUpdate(
  accessToken: string,
  webhookUrl: string,
): Promise<ServiceResult<null>> {
  const settings = loadPlaidSettings();
  if (!settings.ok) {
    return settings;
  }
  try {
    await plaidClient(settings.value).itemWebhookUpdate({
      access_token: accessToken,
      webhook: webhookUrl,
    });
    return ok(null);
  } catch {
    return failure("PROVIDER_UNAVAILABLE");
  }
}

// The JWK for a Plaid-Verification JWT kid, fetched through the
// authenticated verification key endpoint. The route caches per kid and
// refetches on verification failure.
export async function plaidWebhookVerificationKey(
  keyId: string,
): Promise<ServiceResult<Record<string, unknown>>> {
  const settings = loadPlaidSettings();
  if (!settings.ok) {
    return settings;
  }
  try {
    const response = await plaidClient(
      settings.value,
    ).webhookVerificationKeyGet({ key_id: keyId });
    return ok(response.data.key as unknown as Record<string, unknown>);
  } catch {
    return failure("PROVIDER_UNAVAILABLE");
  }
}

// Ask the Plaid sandbox to fire a real signed webhook at the configured
// URL. Exists for the safe local delivery path in spec 0006 tests.
export async function plaidSandboxFireWebhook(
  accessToken: string,
  webhookCode: string,
): Promise<ServiceResult<null>> {
  const settings = loadPlaidSettings();
  if (!settings.ok) {
    return settings;
  }
  try {
    await plaidClient(settings.value).sandboxItemFireWebhook({
      access_token: accessToken,
      webhook_code: webhookCode as never,
    });
    return ok(null);
  } catch {
    return failure("PROVIDER_UNAVAILABLE");
  }
}
