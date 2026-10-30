CREATE TABLE "plugin_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plugin_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"version" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"manifest" jsonb NOT NULL,
	"package_sha256" text NOT NULL,
	"all_projects" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugins_slug_format" CHECK ("plugins"."slug" ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'),
	CONSTRAINT "plugins_version_format" CHECK ("plugins"."version" ~ '^[0-9]{1,4}[.][0-9]{1,4}[.][0-9]{1,4}(-[0-9A-Za-z.-]{1,40})?$'),
	CONSTRAINT "plugins_state_check" CHECK ("plugins"."state" in ('pending', 'enabled', 'disabled')),
	CONSTRAINT "plugins_package_sha256_format" CHECK ("plugins"."package_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "plugins_failures_not_negative" CHECK ("plugins"."failures" >= 0),
	CONSTRAINT "plugins_last_error_length" CHECK (char_length("plugins"."last_error") <= 2000),
	CONSTRAINT "plugins_enabled_are_approved" CHECK ("plugins"."state" <> 'enabled' or "plugins"."approved_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "plugin_projects" ADD CONSTRAINT "plugin_projects_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_projects" ADD CONSTRAINT "plugin_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_projects_plugin_project_unique" ON "plugin_projects" USING btree ("plugin_id","project_id");--> statement-breakpoint
CREATE INDEX "plugin_projects_project_id_idx" ON "plugin_projects" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plugins_slug_unique" ON "plugins" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "plugins_approved_by_id_idx" ON "plugins" USING btree ("approved_by_id");