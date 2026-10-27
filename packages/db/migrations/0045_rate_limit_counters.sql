CREATE TABLE "rate_limit_counters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_counters_count_positive" CHECK ("rate_limit_counters"."count" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_counters_key_unique" ON "rate_limit_counters" USING btree ("key");--> statement-breakpoint
CREATE INDEX "rate_limit_counters_expires_at_idx" ON "rate_limit_counters" USING btree ("expires_at");