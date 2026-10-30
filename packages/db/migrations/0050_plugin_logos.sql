ALTER TABLE "plugins" ADD COLUMN "logo" "bytea";--> statement-breakpoint
ALTER TABLE "plugins" ADD COLUMN "logo_type" text;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_logo_whole" CHECK (("plugins"."logo" is null) = ("plugins"."logo_type" is null));--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_logo_type" CHECK ("plugins"."logo_type" in ('image/png', 'image/webp'));--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_logo_size" CHECK (octet_length("plugins"."logo") <= 262144);