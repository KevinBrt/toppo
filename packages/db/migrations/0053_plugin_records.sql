CREATE TABLE "plugin_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plugin_slug" text NOT NULL,
	"entity" text NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" uuid,
	"created_by_id" uuid,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_records_plugin_slug_format" CHECK ("plugin_records"."plugin_slug" ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'),
	CONSTRAINT "plugin_records_entity_format" CHECK ("plugin_records"."entity" ~ '^[a-z][A-Za-z0-9]{0,39}$'),
	CONSTRAINT "plugin_records_data_object" CHECK (jsonb_typeof("plugin_records"."data") = 'object'),
	CONSTRAINT "plugin_records_data_size" CHECK (octet_length("plugin_records"."data"::text) <= 32768)
);
--> statement-breakpoint
ALTER TABLE "plugin_records" ADD CONSTRAINT "plugin_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD CONSTRAINT "plugin_records_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD CONSTRAINT "plugin_records_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plugin_records_issue_idx" ON "plugin_records" USING btree ("issue_id","plugin_slug","entity","created_at");--> statement-breakpoint
CREATE INDEX "plugin_records_project_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","created_at");--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","created_at");--> statement-breakpoint
CREATE INDEX "plugin_records_plugin_idx" ON "plugin_records" USING btree ("plugin_slug","entity");