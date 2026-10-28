ALTER TABLE "users" DROP CONSTRAINT "users_role_unless_deleted";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plugin_slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_plugin_slug_unique" ON "users" USING btree ("plugin_slug") WHERE "users"."plugin_slug" is not null;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plugin_slug_format" CHECK ("users"."plugin_slug" is null or "users"."plugin_slug" ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plugin_holds_no_role" CHECK ("users"."plugin_slug" is null or ("users"."instance_role_id" is null and not "users"."all_projects"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_unless_deleted" CHECK ("users"."instance_role_id" is not null or "users"."deleted_at" is not null or "users"."plugin_slug" is not null);