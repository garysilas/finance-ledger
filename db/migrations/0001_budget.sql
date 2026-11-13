CREATE TABLE "ledger"."budget" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"month" date NOT NULL,
	"limit_units" bigint NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "budget_owner_category_month_key" UNIQUE("owner_id","category_id","month"),
	CONSTRAINT "budget_limit_nonnegative" CHECK ("ledger"."budget"."limit_units" >= 0),
	CONSTRAINT "budget_month_first_day" CHECK (date_trunc('month', "ledger"."budget"."month"::timestamp) = "ledger"."budget"."month"::timestamp),
	CONSTRAINT "budget_currency_usd" CHECK ("ledger"."budget"."currency_code" = 'USD')
);
--> statement-breakpoint
ALTER TABLE "ledger"."budget" ADD CONSTRAINT "budget_category_fk" FOREIGN KEY ("owner_id","category_id") REFERENCES "ledger"."category"("owner_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_owner_month_idx" ON "ledger"."budget" USING btree ("owner_id","month");