ALTER TABLE "plugin_records" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD CONSTRAINT "plugin_records_person_id_users_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plugin_records_person_idx" ON "plugin_records" USING btree ("person_id","plugin_slug","entity","created_at");--> statement-breakpoint
ALTER TABLE "plugin_records" ADD CONSTRAINT "plugin_records_one_anchor" CHECK (("plugin_records"."project_id" is null) <> ("plugin_records"."person_id" is null));--> statement-breakpoint
ALTER TABLE "plugin_records" ADD CONSTRAINT "plugin_records_issue_in_project" CHECK ("plugin_records"."issue_id" is null or "plugin_records"."project_id" is not null);