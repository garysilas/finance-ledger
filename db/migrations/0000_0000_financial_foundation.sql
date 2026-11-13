CREATE SCHEMA IF NOT EXISTS "ledger";
--> statement-breakpoint
CREATE TABLE "ledger"."account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_account_id" text NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"type" text NOT NULL,
	"subtype" text,
	"currency_code" text,
	"currency_scale" smallint,
	"current_units" bigint,
	"available_units" bigint,
	"credit_limit_units" bigint,
	"balance_observed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "account_connection_provider_key" UNIQUE("connection_id","provider_account_id"),
	CONSTRAINT "account_owner_connection_id_key" UNIQUE("owner_id","connection_id","id"),
	CONSTRAINT "account_currency_group" CHECK ((("ledger"."account"."currency_code" IS NULL AND "ledger"."account"."currency_scale" IS NULL) OR ("ledger"."account"."currency_code" IS NOT NULL AND "ledger"."account"."currency_scale" IS NOT NULL))),
	CONSTRAINT "account_amounts_require_currency" CHECK ((("ledger"."account"."current_units" IS NULL AND "ledger"."account"."available_units" IS NULL AND "ledger"."account"."credit_limit_units" IS NULL) OR "ledger"."account"."currency_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ledger"."audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"operation" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"resulting_revision" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_actor_type" CHECK ("ledger"."audit"."actor_type" IN ('owner', 'provider', 'setup'))
);
--> statement-breakpoint
CREATE TABLE "ledger"."category" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"label" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "category_owner_stable_key" UNIQUE("owner_id","stable_key"),
	CONSTRAINT "category_owner_id_key" UNIQUE("owner_id","id")
);
--> statement-breakpoint
CREATE TABLE "ledger"."connection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"provider_item_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"state" text DEFAULT 'active' NOT NULL,
	"token_version" integer,
	"token_key_id" text,
	"token_nonce" "bytea",
	"token_ciphertext" "bytea",
	"token_tag" "bytea",
	"sync_cursor" text,
	"last_successful_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "connection_provider_item_key" UNIQUE("provider","environment","provider_item_id"),
	CONSTRAINT "connection_owner_id_key" UNIQUE("owner_id","id"),
	CONSTRAINT "connection_state" CHECK ("ledger"."connection"."state" IN ('active', 'needs_reconnect', 'disconnected')),
	CONSTRAINT "connection_envelope_group" CHECK ((("ledger"."connection"."token_version" IS NULL AND "ledger"."connection"."token_key_id" IS NULL AND "ledger"."connection"."token_nonce" IS NULL AND "ledger"."connection"."token_ciphertext" IS NULL AND "ledger"."connection"."token_tag" IS NULL) OR ("ledger"."connection"."token_version" IS NOT NULL AND "ledger"."connection"."token_key_id" IS NOT NULL AND "ledger"."connection"."token_nonce" IS NOT NULL AND "ledger"."connection"."token_ciphertext" IS NOT NULL AND "ledger"."connection"."token_tag" IS NOT NULL))),
	CONSTRAINT "connection_state_envelope" CHECK ((("ledger"."connection"."state" = 'disconnected' AND "ledger"."connection"."token_version" IS NULL) OR ("ledger"."connection"."state" <> 'disconnected' AND "ledger"."connection"."token_version" IS NOT NULL))),
	CONSTRAINT "connection_provider_environment" CHECK ("ledger"."connection"."provider" = 'plaid' AND "ledger"."connection"."environment" = 'sandbox')
);
--> statement-breakpoint
CREATE TABLE "ledger"."owner" (
	"id" uuid PRIMARY KEY NOT NULL,
	"singleton_flag" boolean DEFAULT true NOT NULL,
	"time_zone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_singleton_key" UNIQUE("singleton_flag"),
	CONSTRAINT "owner_singleton_flag" CHECK ("ledger"."owner"."singleton_flag"),
	CONSTRAINT "owner_time_zone" CHECK ("ledger"."owner"."time_zone" = 'America/New_York')
);
--> statement-breakpoint
CREATE TABLE "ledger"."request_receipt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_digest" "bytea" NOT NULL,
	"target_id" uuid,
	"resulting_revision" bigint,
	"outcome" text NOT NULL,
	"operation_counts" jsonb NOT NULL,
	"committed_cursor" text,
	"correction_conflicts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_receipt_owner_operation_request_key" UNIQUE("owner_id","operation","request_id"),
	CONSTRAINT "request_receipt_outcome" CHECK ("ledger"."request_receipt"."outcome" IN ('applied', 'no_change'))
);
--> statement-breakpoint
CREATE TABLE "ledger"."transaction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_transaction_id" text NOT NULL,
	"amount_units" bigint NOT NULL,
	"currency_code" text NOT NULL,
	"currency_scale" smallint NOT NULL,
	"posting_state" text NOT NULL,
	"provider_date" date NOT NULL,
	"posted_date" date,
	"authorized_date" date,
	"removed_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"provider_pending_transaction_id" text,
	"description" text NOT NULL,
	"merchant_name" text,
	"provider_category_code" text,
	"provider_category_id" uuid,
	"provider_classification" text,
	"owner_category_id" uuid,
	"owner_classification" text,
	"category_intent" text DEFAULT 'untouched' NOT NULL,
	"classification_intent" text DEFAULT 'untouched' NOT NULL,
	"category_inherited_from_id" uuid,
	"classification_inherited_from_id" uuid,
	"owner_edit_revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "transaction_connection_provider_key" UNIQUE("connection_id","provider_transaction_id"),
	CONSTRAINT "transaction_owner_connection_account_id_key" UNIQUE("owner_id","connection_id","account_id","id"),
	CONSTRAINT "transaction_superseded_by_key" UNIQUE("superseded_by_id"),
	CONSTRAINT "transaction_posting_state" CHECK ("ledger"."transaction"."posting_state" IN ('pending', 'posted')),
	CONSTRAINT "transaction_posted_date" CHECK ((("ledger"."transaction"."posting_state" = 'posted' AND "ledger"."transaction"."posted_date" IS NOT NULL) OR ("ledger"."transaction"."posting_state" = 'pending' AND "ledger"."transaction"."posted_date" IS NULL))),
	CONSTRAINT "transaction_no_self_link" CHECK ("ledger"."transaction"."superseded_by_id" <> "ledger"."transaction"."id"),
	CONSTRAINT "transaction_category_intent" CHECK ("ledger"."transaction"."category_intent" IN ('untouched', 'override', 'reset', 'inherited')),
	CONSTRAINT "transaction_classification_intent" CHECK ("ledger"."transaction"."classification_intent" IN ('untouched', 'override', 'reset', 'inherited')),
	CONSTRAINT "transaction_category_intent_consistency" CHECK ((("ledger"."transaction"."category_intent" IN ('untouched', 'reset') AND "ledger"."transaction"."owner_category_id" IS NULL AND "ledger"."transaction"."category_inherited_from_id" IS NULL) OR ("ledger"."transaction"."category_intent" = 'override' AND "ledger"."transaction"."owner_category_id" IS NOT NULL AND "ledger"."transaction"."category_inherited_from_id" IS NULL) OR ("ledger"."transaction"."category_intent" = 'inherited' AND "ledger"."transaction"."owner_category_id" IS NOT NULL AND "ledger"."transaction"."category_inherited_from_id" IS NOT NULL))),
	CONSTRAINT "transaction_classification_intent_consistency" CHECK ((("ledger"."transaction"."classification_intent" IN ('untouched', 'reset') AND "ledger"."transaction"."owner_classification" IS NULL AND "ledger"."transaction"."classification_inherited_from_id" IS NULL) OR ("ledger"."transaction"."classification_intent" = 'override' AND "ledger"."transaction"."owner_classification" IS NOT NULL AND "ledger"."transaction"."classification_inherited_from_id" IS NULL) OR ("ledger"."transaction"."classification_intent" = 'inherited' AND "ledger"."transaction"."owner_classification" IS NOT NULL AND "ledger"."transaction"."classification_inherited_from_id" IS NOT NULL))),
	CONSTRAINT "transaction_provider_classification" CHECK ("ledger"."transaction"."provider_classification" IS NULL OR "ledger"."transaction"."provider_classification" IN ('spending', 'refund', 'income', 'transfer', 'card_payment', 'unclassified')),
	CONSTRAINT "transaction_owner_classification" CHECK ("ledger"."transaction"."owner_classification" IS NULL OR "ledger"."transaction"."owner_classification" IN ('spending', 'refund', 'income', 'transfer', 'card_payment', 'unclassified'))
);
--> statement-breakpoint
ALTER TABLE "ledger"."account" ADD CONSTRAINT "account_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "ledger"."owner"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."account" ADD CONSTRAINT "account_owner_connection_fk" FOREIGN KEY ("owner_id","connection_id") REFERENCES "ledger"."connection"("owner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."audit" ADD CONSTRAINT "audit_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "ledger"."owner"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."audit" ADD CONSTRAINT "audit_receipt_fk" FOREIGN KEY ("receipt_id") REFERENCES "ledger"."request_receipt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."category" ADD CONSTRAINT "category_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "ledger"."owner"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."connection" ADD CONSTRAINT "connection_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "ledger"."owner"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."request_receipt" ADD CONSTRAINT "request_receipt_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "ledger"."owner"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."transaction" ADD CONSTRAINT "transaction_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "ledger"."owner"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."transaction" ADD CONSTRAINT "transaction_account_fk" FOREIGN KEY ("owner_id","connection_id","account_id") REFERENCES "ledger"."account"("owner_id","connection_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."transaction" ADD CONSTRAINT "transaction_superseded_fk" FOREIGN KEY ("owner_id","connection_id","account_id","superseded_by_id") REFERENCES "ledger"."transaction"("owner_id","connection_id","account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."transaction" ADD CONSTRAINT "transaction_category_inherited_fk" FOREIGN KEY ("owner_id","connection_id","account_id","category_inherited_from_id") REFERENCES "ledger"."transaction"("owner_id","connection_id","account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."transaction" ADD CONSTRAINT "transaction_classification_inherited_fk" FOREIGN KEY ("owner_id","connection_id","account_id","classification_inherited_from_id") REFERENCES "ledger"."transaction"("owner_id","connection_id","account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."transaction" ADD CONSTRAINT "transaction_provider_category_fk" FOREIGN KEY ("owner_id","provider_category_id") REFERENCES "ledger"."category"("owner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."transaction" ADD CONSTRAINT "transaction_owner_category_fk" FOREIGN KEY ("owner_id","owner_category_id") REFERENCES "ledger"."category"("owner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_owner_posted_date_idx" ON "ledger"."transaction" USING btree ("owner_id","posted_date");--> statement-breakpoint
CREATE INDEX "transaction_account_provider_date_idx" ON "ledger"."transaction" USING btree ("account_id","provider_date");