import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const ledger = pgSchema("ledger");

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
};

const mutable = {
  ...timestamps,
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  revision: bigint("revision", { mode: "bigint" })
    .notNull()
    .default(sql`1`),
};

export const owner = ledger.table(
  "owner",
  {
    id: uuid("id").primaryKey(),
    singletonFlag: boolean("singleton_flag").notNull().default(true),
    timeZone: text("time_zone").notNull().default("America/New_York"),
    ...timestamps,
  },
  (table) => [
    unique("owner_singleton_key").on(table.singletonFlag),
    check("owner_singleton_flag", sql`${table.singletonFlag}`),
    check("owner_time_zone", sql`${table.timeZone} = 'America/New_York'`),
  ],
);

export const connection = ledger.table(
  "connection",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    provider: text("provider").notNull(),
    environment: text("environment").notNull(),
    providerItemId: text("provider_item_id").notNull(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    state: text("state").notNull().default("active"),
    tokenVersion: integer("token_version"),
    tokenKeyId: text("token_key_id"),
    tokenNonce: bytea("token_nonce"),
    tokenCiphertext: bytea("token_ciphertext"),
    tokenTag: bytea("token_tag"),
    syncCursor: text("sync_cursor"),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...mutable,
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [owner.id],
      name: "connection_owner_fk",
    }).onDelete("restrict"),
    unique("connection_provider_item_key").on(
      table.provider,
      table.environment,
      table.providerItemId,
    ),
    unique("connection_owner_id_key").on(table.ownerId, table.id),
    check(
      "connection_state",
      sql`${table.state} IN ('active', 'needs_reconnect', 'disconnected')`,
    ),
    check(
      "connection_envelope_group",
      sql`((${table.tokenVersion} IS NULL AND ${table.tokenKeyId} IS NULL AND ${table.tokenNonce} IS NULL AND ${table.tokenCiphertext} IS NULL AND ${table.tokenTag} IS NULL) OR (${table.tokenVersion} IS NOT NULL AND ${table.tokenKeyId} IS NOT NULL AND ${table.tokenNonce} IS NOT NULL AND ${table.tokenCiphertext} IS NOT NULL AND ${table.tokenTag} IS NOT NULL))`,
    ),
    check(
      "connection_state_envelope",
      sql`((${table.state} = 'disconnected' AND ${table.tokenVersion} IS NULL) OR (${table.state} <> 'disconnected' AND ${table.tokenVersion} IS NOT NULL))`,
    ),
    check(
      "connection_provider_environment",
      sql`${table.provider} = 'plaid' AND ${table.environment} = 'sandbox'`,
    ),
  ],
);

export const category = ledger.table(
  "category",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    stableKey: text("stable_key").notNull(),
    label: text("label").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...mutable,
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [owner.id],
      name: "category_owner_fk",
    }).onDelete("restrict"),
    unique("category_owner_stable_key").on(table.ownerId, table.stableKey),
    unique("category_owner_id_key").on(table.ownerId, table.id),
  ],
);

export const account = ledger.table(
  "account",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    name: text("name").notNull(),
    officialName: text("official_name"),
    type: text("type").notNull(),
    subtype: text("subtype"),
    currencyCode: text("currency_code"),
    currencyScale: smallint("currency_scale"),
    currentUnits: bigint("current_units", { mode: "bigint" }),
    availableUnits: bigint("available_units", { mode: "bigint" }),
    creditLimitUnits: bigint("credit_limit_units", { mode: "bigint" }),
    balanceObservedAt: timestamp("balance_observed_at", {
      withTimezone: true,
      mode: "date",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...mutable,
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [owner.id],
      name: "account_owner_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.ownerId, table.connectionId],
      foreignColumns: [connection.ownerId, connection.id],
      name: "account_owner_connection_fk",
    }).onDelete("restrict"),
    unique("account_connection_provider_key").on(
      table.connectionId,
      table.providerAccountId,
    ),
    unique("account_owner_connection_id_key").on(
      table.ownerId,
      table.connectionId,
      table.id,
    ),
    check(
      "account_currency_group",
      sql`((${table.currencyCode} IS NULL AND ${table.currencyScale} IS NULL) OR (${table.currencyCode} IS NOT NULL AND ${table.currencyScale} IS NOT NULL))`,
    ),
    check(
      "account_amounts_require_currency",
      sql`((${table.currentUnits} IS NULL AND ${table.availableUnits} IS NULL AND ${table.creditLimitUnits} IS NULL) OR ${table.currencyCode} IS NOT NULL)`,
    ),
  ],
);

export const transaction = ledger.table(
  "transaction",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    accountId: uuid("account_id").notNull(),
    providerTransactionId: text("provider_transaction_id").notNull(),
    amountUnits: bigint("amount_units", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code").notNull(),
    currencyScale: smallint("currency_scale").notNull(),
    postingState: text("posting_state").notNull(),
    providerDate: date("provider_date", { mode: "string" }).notNull(),
    postedDate: date("posted_date", { mode: "string" }),
    authorizedDate: date("authorized_date", { mode: "string" }),
    removedAt: timestamp("removed_at", { withTimezone: true, mode: "date" }),
    supersededById: uuid("superseded_by_id"),
    providerPendingTransactionId: text("provider_pending_transaction_id"),
    description: text("description").notNull(),
    merchantName: text("merchant_name"),
    providerCategoryCode: text("provider_category_code"),
    providerCategoryId: uuid("provider_category_id"),
    providerClassification: text("provider_classification"),
    ownerCategoryId: uuid("owner_category_id"),
    ownerClassification: text("owner_classification"),
    categoryIntent: text("category_intent").notNull().default("untouched"),
    classificationIntent: text("classification_intent")
      .notNull()
      .default("untouched"),
    categoryInheritedFromId: uuid("category_inherited_from_id"),
    classificationInheritedFromId: uuid("classification_inherited_from_id"),
    ownerEditRevision: bigint("owner_edit_revision", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    ...mutable,
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [owner.id],
      name: "transaction_owner_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.ownerId, table.connectionId, table.accountId],
      foreignColumns: [account.ownerId, account.connectionId, account.id],
      name: "transaction_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.ownerId,
        table.connectionId,
        table.accountId,
        table.supersededById,
      ],
      foreignColumns: [
        table.ownerId,
        table.connectionId,
        table.accountId,
        table.id,
      ],
      name: "transaction_superseded_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.ownerId,
        table.connectionId,
        table.accountId,
        table.categoryInheritedFromId,
      ],
      foreignColumns: [
        table.ownerId,
        table.connectionId,
        table.accountId,
        table.id,
      ],
      name: "transaction_category_inherited_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.ownerId,
        table.connectionId,
        table.accountId,
        table.classificationInheritedFromId,
      ],
      foreignColumns: [
        table.ownerId,
        table.connectionId,
        table.accountId,
        table.id,
      ],
      name: "transaction_classification_inherited_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.ownerId, table.providerCategoryId],
      foreignColumns: [category.ownerId, category.id],
      name: "transaction_provider_category_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.ownerId, table.ownerCategoryId],
      foreignColumns: [category.ownerId, category.id],
      name: "transaction_owner_category_fk",
    }).onDelete("restrict"),
    unique("transaction_connection_provider_key").on(
      table.connectionId,
      table.providerTransactionId,
    ),
    unique("transaction_owner_connection_account_id_key").on(
      table.ownerId,
      table.connectionId,
      table.accountId,
      table.id,
    ),
    unique("transaction_superseded_by_key").on(table.supersededById),
    index("transaction_owner_posted_date_idx").on(
      table.ownerId,
      table.postedDate,
    ),
    index("transaction_account_provider_date_idx").on(
      table.accountId,
      table.providerDate,
    ),
    check(
      "transaction_posting_state",
      sql`${table.postingState} IN ('pending', 'posted')`,
    ),
    check(
      "transaction_posted_date",
      sql`((${table.postingState} = 'posted' AND ${table.postedDate} IS NOT NULL) OR (${table.postingState} = 'pending' AND ${table.postedDate} IS NULL))`,
    ),
    check(
      "transaction_no_self_link",
      sql`${table.supersededById} <> ${table.id}`,
    ),
    check(
      "transaction_category_intent",
      sql`${table.categoryIntent} IN ('untouched', 'override', 'reset', 'inherited')`,
    ),
    check(
      "transaction_classification_intent",
      sql`${table.classificationIntent} IN ('untouched', 'override', 'reset', 'inherited')`,
    ),
    check(
      "transaction_category_intent_consistency",
      sql`((${table.categoryIntent} IN ('untouched', 'reset') AND ${table.ownerCategoryId} IS NULL AND ${table.categoryInheritedFromId} IS NULL) OR (${table.categoryIntent} = 'override' AND ${table.ownerCategoryId} IS NOT NULL AND ${table.categoryInheritedFromId} IS NULL) OR (${table.categoryIntent} = 'inherited' AND ${table.ownerCategoryId} IS NOT NULL AND ${table.categoryInheritedFromId} IS NOT NULL))`,
    ),
    check(
      "transaction_classification_intent_consistency",
      sql`((${table.classificationIntent} IN ('untouched', 'reset') AND ${table.ownerClassification} IS NULL AND ${table.classificationInheritedFromId} IS NULL) OR (${table.classificationIntent} = 'override' AND ${table.ownerClassification} IS NOT NULL AND ${table.classificationInheritedFromId} IS NULL) OR (${table.classificationIntent} = 'inherited' AND ${table.ownerClassification} IS NOT NULL AND ${table.classificationInheritedFromId} IS NOT NULL))`,
    ),
    check(
      "transaction_provider_classification",
      sql`${table.providerClassification} IS NULL OR ${table.providerClassification} IN ('spending', 'refund', 'income', 'transfer', 'card_payment', 'unclassified')`,
    ),
    check(
      "transaction_owner_classification",
      sql`${table.ownerClassification} IS NULL OR ${table.ownerClassification} IN ('spending', 'refund', 'income', 'transfer', 'card_payment', 'unclassified')`,
    ),
  ],
);

export const requestReceipt = ledger.table(
  "request_receipt",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    operation: text("operation").notNull(),
    requestId: uuid("request_id").notNull(),
    requestDigest: bytea("request_digest").notNull(),
    targetId: uuid("target_id"),
    resultingRevision: bigint("resulting_revision", { mode: "bigint" }),
    outcome: text("outcome").notNull(),
    operationCounts: jsonb("operation_counts").notNull(),
    committedCursor: text("committed_cursor"),
    correctionConflicts: jsonb("correction_conflicts"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [owner.id],
      name: "request_receipt_owner_fk",
    }).onDelete("restrict"),
    unique("request_receipt_owner_operation_request_key").on(
      table.ownerId,
      table.operation,
      table.requestId,
    ),
    check(
      "request_receipt_outcome",
      sql`${table.outcome} IN ('applied', 'no_change')`,
    ),
  ],
);

export const budget = ledger.table(
  "budget",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    month: date("month", { mode: "string" }).notNull(),
    limitUnits: bigint("limit_units", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code").notNull().default("USD"),
    ...mutable,
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId, table.categoryId],
      foreignColumns: [category.ownerId, category.id],
      name: "budget_category_fk",
    }).onDelete("restrict"),
    unique("budget_owner_category_month_key").on(
      table.ownerId,
      table.categoryId,
      table.month,
    ),
    index("budget_owner_month_idx").on(table.ownerId, table.month),
    check("budget_limit_nonnegative", sql`${table.limitUnits} >= 0`),
    check(
      "budget_month_first_day",
      sql`date_trunc('month', ${table.month}::timestamp) = ${table.month}::timestamp`,
    ),
    check("budget_currency_usd", sql`${table.currencyCode} = 'USD'`),
  ],
);

export const audit = ledger.table(
  "audit",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    actorType: text("actor_type").notNull(),
    operation: text("operation").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    resultingRevision: bigint("resulting_revision", {
      mode: "bigint",
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [owner.id],
      name: "audit_owner_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.receiptId],
      foreignColumns: [requestReceipt.id],
      name: "audit_receipt_fk",
    }).onDelete("restrict"),
    check(
      "audit_actor_type",
      sql`${table.actorType} IN ('owner', 'provider', 'setup')`,
    ),
  ],
);
