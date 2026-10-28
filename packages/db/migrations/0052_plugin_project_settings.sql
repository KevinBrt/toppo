CREATE TABLE "plugin_project_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plugin_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"settings" jsonb NOT NULL,
	"refused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_project_settings_object" CHECK (jsonb_typeof("plugin_project_settings"."settings") = 'object'),
	CONSTRAINT "plugin_project_settings_size" CHECK (octet_length("plugin_project_settings"."settings"::text) <= 32768)
);
--> statement-breakpoint
ALTER TABLE "plugin_project_settings" ADD CONSTRAINT "plugin_project_settings_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_project_settings" ADD CONSTRAINT "plugin_project_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_project_settings_plugin_project_unique" ON "plugin_project_settings" USING btree ("plugin_id","project_id");--> statement-breakpoint
CREATE INDEX "plugin_project_settings_project_id_idx" ON "plugin_project_settings" USING btree ("project_id");