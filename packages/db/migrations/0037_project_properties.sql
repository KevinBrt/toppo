CREATE TABLE "project_properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"own_options" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_properties_project_property_unique" UNIQUE("project_id","property_id")
);
--> statement-breakpoint
DROP INDEX "properties_name_unique";--> statement-breakpoint
DROP INDEX "property_options_name_unique";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "category_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "category_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "priority_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "priority_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "property_options" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "project_properties" ADD CONSTRAINT "project_properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_properties" ADD CONSTRAINT "project_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_properties_property_id_idx" ON "project_properties" USING btree ("property_id");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_options" ADD CONSTRAINT "property_options_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "properties_instance_name_unique" ON "properties" USING btree (lower("name")) WHERE "properties"."project_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "properties_project_name_unique" ON "properties" USING btree ("project_id",lower("name")) WHERE "properties"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "properties_project_id_idx" ON "properties" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_options_instance_name_unique" ON "property_options" USING btree ("property_id",lower("name")) WHERE "property_options"."project_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "property_options_project_name_unique" ON "property_options" USING btree ("property_id","project_id",lower("name")) WHERE "property_options"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "property_options_project_id_idx" ON "property_options" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_category_hidden_or_required" CHECK (not ("projects"."category_hidden" and "projects"."category_required"));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_priority_hidden_or_required" CHECK (not ("projects"."priority_hidden" and "projects"."priority_required"));