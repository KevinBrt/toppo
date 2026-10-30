ALTER TABLE "properties" ADD COLUMN "plugin_slug" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "plugin_property" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "written_by" text DEFAULT 'people' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "display" text;--> statement-breakpoint
CREATE UNIQUE INDEX "properties_plugin_property_unique" ON "properties" USING btree ("plugin_slug","plugin_property") WHERE "properties"."plugin_slug" is not null;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_plugin_named" CHECK (("properties"."plugin_slug" is null) = ("properties"."plugin_property" is null));--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_plugin_slug_format" CHECK ("properties"."plugin_slug" ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$');--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_plugin_property_format" CHECK ("properties"."plugin_property" ~ '^[a-z][A-Za-z0-9]{0,39}$');--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_plugin_of_instance" CHECK ("properties"."plugin_slug" is null or "properties"."project_id" is null);--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_written_by" CHECK ("properties"."written_by" = 'people' or ("properties"."written_by" = 'plugin' and "properties"."plugin_slug" is not null));--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_plugin_written_not_asked" CHECK ("properties"."written_by" = 'people' or not "properties"."asked_at_creation");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_display" CHECK ("properties"."display" is null or ("properties"."display" = 'duration' and "properties"."type" = 'number'));