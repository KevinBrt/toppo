ALTER TABLE "instance_settings" ADD COLUMN "latest_version" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "latest_version_url" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "latest_version_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_latest_version" CHECK (("instance_settings"."latest_version" is null) = ("instance_settings"."latest_version_url" is null)
        and ("instance_settings"."latest_version" is null or "instance_settings"."latest_version" ~ '^[0-9]+[.][0-9]+[.][0-9]+$')
        and ("instance_settings"."latest_version_url" is null or "instance_settings"."latest_version_url" like 'https://%'));