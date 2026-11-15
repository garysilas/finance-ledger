CREATE TABLE "ledger"."webhook_delivery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"connection_id" uuid,
	"webhook_id" text NOT NULL,
	"webhook_type" text NOT NULL,
	"webhook_code" text NOT NULL,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_delivery_webhook_id_key" UNIQUE("webhook_id"),
	CONSTRAINT "webhook_delivery_owner_id_key" UNIQUE("owner_id","id"),
	CONSTRAINT "webhook_delivery_outcome" CHECK ("ledger"."webhook_delivery"."outcome" IN ('received', 'applied', 'duplicate', 'ignored', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "ledger"."connection" ADD COLUMN "sync_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ledger"."connection" ADD COLUMN "last_sync_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ledger"."connection" ADD COLUMN "last_sync_failure" text;--> statement-breakpoint
ALTER TABLE "ledger"."webhook_delivery" ADD CONSTRAINT "webhook_delivery_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "ledger"."owner"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."webhook_delivery" ADD CONSTRAINT "webhook_delivery_connection_fk" FOREIGN KEY ("owner_id","connection_id") REFERENCES "ledger"."connection"("owner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."connection" ADD CONSTRAINT "connection_last_sync_failure" CHECK ("ledger"."connection"."last_sync_failure" IS NULL OR "ledger"."connection"."last_sync_failure" IN ('INVALID_INPUT', 'UNSUPPORTED_MONEY', 'NOT_FOUND', 'CONFLICT', 'INVALID_TRANSITION', 'CONFIG_INVALID', 'KEY_UNAVAILABLE', 'PROVIDER_UNAVAILABLE', 'TOKEN_UNREADABLE', 'DB_UNAVAILABLE', 'DB_TIMEOUT', 'COMMIT_UNKNOWN', 'INTERNAL_FAILURE', 'SYNC_IN_PROGRESS', 'NEEDS_RECONNECT', 'ITEM_STILL_ERROR'));