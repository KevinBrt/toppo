ALTER TABLE "plugins" ALTER COLUMN "manifest" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "plugins" ADD COLUMN "settings_refused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_settings_object" CHECK (jsonb_typeof("plugins"."settings") = 'object');--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_settings_size" CHECK (octet_length("plugins"."settings"::text) <= 32768);--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_refused_settings_stop" CHECK (not "plugins"."settings_refused" or "plugins"."state" <> 'enabled');