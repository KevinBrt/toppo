CREATE TABLE "plugin_http_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plugin_id" uuid NOT NULL,
	"method" text NOT NULL,
	"host" text NOT NULL,
	"status" integer,
	"error" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_http_calls_method_check" CHECK ("plugin_http_calls"."method" in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE')),
	CONSTRAINT "plugin_http_calls_host_length" CHECK (char_length("plugin_http_calls"."host") between 1 and 260),
	CONSTRAINT "plugin_http_calls_status_range" CHECK ("plugin_http_calls"."status" between 100 and 599),
	CONSTRAINT "plugin_http_calls_error_check" CHECK ("plugin_http_calls"."error" in ('HOST_NOT_DECLARED', 'ADDRESS_NOT_ALLOWED', 'TOO_MANY_CALLS', 'TIMEOUT', 'RESPONSE_TOO_LARGE', 'TOO_MANY_REDIRECTS', 'NETWORK_ERROR')),
	CONSTRAINT "plugin_http_calls_answered_or_not" CHECK (("plugin_http_calls"."status" is null) <> ("plugin_http_calls"."error" is null)),
	CONSTRAINT "plugin_http_calls_duration_not_negative" CHECK ("plugin_http_calls"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plugins" ADD COLUMN "private_hosts" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "plugin_http_calls" ADD CONSTRAINT "plugin_http_calls_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plugin_http_calls_plugin_id_created_at_idx" ON "plugin_http_calls" USING btree ("plugin_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_private_hosts_count" CHECK (cardinality("plugins"."private_hosts") <= 10);--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_private_hosts_format" CHECK (array_to_string("plugins"."private_hosts", ' ') ~ '^([a-z0-9]([a-z0-9.:-]{0,251}[a-z0-9])?( |$))*$');