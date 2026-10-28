CREATE TABLE "plugin_once_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plugin_slug" text NOT NULL,
	"method" text NOT NULL,
	"key" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_once_keys_plugin_slug_format" CHECK ("plugin_once_keys"."plugin_slug" ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'),
	CONSTRAINT "plugin_once_keys_method_length" CHECK (char_length("plugin_once_keys"."method") between 1 and 100),
	CONSTRAINT "plugin_once_keys_key_length" CHECK (char_length("plugin_once_keys"."key") between 1 and 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_once_keys_unique" ON "plugin_once_keys" USING btree ("plugin_slug","method","key");--> statement-breakpoint
CREATE INDEX "plugin_once_keys_created_at_idx" ON "plugin_once_keys" USING btree ("created_at");