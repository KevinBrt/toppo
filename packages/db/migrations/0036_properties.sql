CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"shown_in_list" boolean DEFAULT false NOT NULL,
	"asked_at_creation" boolean DEFAULT false NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_name_not_blank" CHECK (btrim("properties"."name") <> ''),
	CONSTRAINT "properties_name_length" CHECK (char_length("properties"."name") <= 40),
	CONSTRAINT "properties_type_check" CHECK ("properties"."type" in ('list')),
	CONSTRAINT "properties_required_if_asked" CHECK ("properties"."asked_at_creation" or not "properties"."required")
);
--> statement-breakpoint
CREATE TABLE "property_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gray' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_options_name_not_blank" CHECK (btrim("property_options"."name") <> ''),
	CONSTRAINT "property_options_name_length" CHECK (char_length("property_options"."name") <= 40),
	CONSTRAINT "property_options_color_check" CHECK ("property_options"."color" in ('gray', 'blue', 'green', 'amber', 'violet', 'cyan', 'orange', 'pink'))
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "properties" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "property_options" ADD CONSTRAINT "property_options_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "properties_name_unique" ON "properties" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "property_options_name_unique" ON "property_options" USING btree ("property_id",lower("name"));--> statement-breakpoint
CREATE INDEX "property_options_property_id_idx" ON "property_options" USING btree ("property_id","position");--> statement-breakpoint
CREATE INDEX "issues_properties_idx" ON "issues" USING gin ("properties" jsonb_path_ops);