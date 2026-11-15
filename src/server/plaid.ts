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
  getConnectionSyncState,
  markSyncSuccess,
} from "@/features/finance/connection-service";

// The trusted provider adapter. It is the only module allowed to call
// decryptConnectionToken and getConnectionSyncState; plaintext access
// tokens exist only inside these functions and never reach display
// values, logs, or action results.

const plaidSettings = z.object({
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1),
  PLAID_ENV: z.literal("sandbox"),
});

type PlaidConfig = { clientId: string; secret: string };

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
  });
  if (!parsed.success) {
    return failure("CONFIG_INVALID");
  }
  return ok({
    clientId: parsed.data.PLAID_CLIENT_ID,
    secret: parsed.data.PLAID_SECRET,
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
  } catch {
    return failure("PROVIDER_UNAVAILABLE");
  }
}

export type InitialSyncOutcome = {
  connectionId: string;
  cursor: string;
  counts: { inserted: number; updated: number; removed: number };
};

// Import exactly one /transactions/sync page through the foundation batch
// service: read the live cursor, decrypt the token, fetch one page,
// normalize, and commit. has_more is ignored; history_complete stays
// false because one page never claims complete history.
export async function importInitialSyncPage(
  databaseUrl: string,
  input: { ownerId: string; connectionId: string },
): Promise<ServiceResult<InitialSyncOutcome>> {
  const syncState = await getConnectionSyncState(databaseUrl, input);
  if (!syncState.ok) {
    return syncState;
  }
  if (syncState.value.state !== "active") {
    return failure("INVALID_TRANSITION");
  }
  const token = await decryptConnectionToken(databaseUrl, input);
  if (!token.ok) {
    return token;
  }
  const page = await plaidTransactionsSync(token.value, syncState.value.cursor);
  if (!page.ok) {
    return page;
  }
  const normalized = normalizeSyncPage(page.value);
  if (!normalized.ok) {
    return normalized;
  }
  const batch = await applyProviderBatch(databaseUrl, {
    ownerId: input.ownerId,
    connectionId: input.connectionId,
    expectedCursor: syncState.value.cursor,
    nextCursor: normalized.value.nextCursor,
    accountObservations: normalized.value.accountObservations,
    transactionUpserts: normalized.value.transactionUpserts,
    removalIds: normalized.value.removalIds,
    requestId: randomUUID(),
  });
  if (!batch.ok) {
    return batch;
  }
  const marked = await markSyncSuccess(databaseUrl, input);
  if (!marked.ok) {
    return marked;
  }
  return ok({
    connectionId: input.connectionId,
    cursor: normalized.value.nextCursor,
    counts: batch.value.counts,
  });
}
