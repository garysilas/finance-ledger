CREATE TABLE "ledger"."session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "session_owner_id_key" UNIQUE("owner_id","id")
);
--> statement-breakpoint
ALTER TABLE "ledger"."connection" ADD COLUMN "history_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger"."owner" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "ledger"."session" ADD CONSTRAINT "session_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "ledger"."owner"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "ledger"."session" USING btree ("expires_at");