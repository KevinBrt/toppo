CREATE TABLE "plugin_record_slots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plugin_slug" text NOT NULL,
	"entity" text NOT NULL,
	"field" text NOT NULL,
	"slot" text NOT NULL,
	"declared" jsonb NOT NULL,
	"filled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_record_slots_plugin_slug_format" CHECK ("plugin_record_slots"."plugin_slug" ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'),
	CONSTRAINT "plugin_record_slots_entity_format" CHECK ("plugin_record_slots"."entity" ~ '^[a-z][A-Za-z0-9]{0,39}$'),
	CONSTRAINT "plugin_record_slots_field_format" CHECK ("plugin_record_slots"."field" ~ '^[a-z][A-Za-z0-9]{0,39}$'),
	CONSTRAINT "plugin_record_slots_slot_name" CHECK ("plugin_record_slots"."slot" ~ '^(date[1-3]|number[1-3]|text[1-3]|ref[1-2])$'),
	CONSTRAINT "plugin_record_slots_declared_object" CHECK (jsonb_typeof("plugin_record_slots"."declared") = 'object'),
	CONSTRAINT "plugin_record_slots_declared_size" CHECK (octet_length("plugin_record_slots"."declared"::text) <= 32768)
);
--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "date_1" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "date_2" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "date_3" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "number_1" numeric;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "number_2" numeric;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "number_3" numeric;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "text_1" text;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "text_2" text;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "text_3" text;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "ref_1" uuid;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD COLUMN "ref_2" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_record_slots_field_unique" ON "plugin_record_slots" USING btree ("plugin_slug","entity","field");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_record_slots_slot_unique" ON "plugin_record_slots" USING btree ("plugin_slug","entity","slot");--> statement-breakpoint
CREATE INDEX "plugin_records_project_date1_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","date_1") WHERE "plugin_records"."date_1" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_date1_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","date_1") WHERE "plugin_records"."date_1" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_date2_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","date_2") WHERE "plugin_records"."date_2" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_date2_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","date_2") WHERE "plugin_records"."date_2" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_date3_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","date_3") WHERE "plugin_records"."date_3" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_date3_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","date_3") WHERE "plugin_records"."date_3" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_number1_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","number_1") WHERE "plugin_records"."number_1" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_number1_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","number_1") WHERE "plugin_records"."number_1" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_number2_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","number_2") WHERE "plugin_records"."number_2" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_number2_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","number_2") WHERE "plugin_records"."number_2" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_number3_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","number_3") WHERE "plugin_records"."number_3" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_number3_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","number_3") WHERE "plugin_records"."number_3" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_text1_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","text_1") WHERE "plugin_records"."text_1" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_text1_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","text_1") WHERE "plugin_records"."text_1" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_text2_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","text_2") WHERE "plugin_records"."text_2" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_text2_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","text_2") WHERE "plugin_records"."text_2" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_text3_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","text_3") WHERE "plugin_records"."text_3" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_text3_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","text_3") WHERE "plugin_records"."text_3" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_ref1_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","ref_1") WHERE "plugin_records"."ref_1" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_ref1_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","ref_1") WHERE "plugin_records"."ref_1" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_project_ref2_idx" ON "plugin_records" USING btree ("project_id","plugin_slug","entity","ref_2") WHERE "plugin_records"."ref_2" is not null;--> statement-breakpoint
CREATE INDEX "plugin_records_created_by_ref2_idx" ON "plugin_records" USING btree ("created_by_id","plugin_slug","entity","ref_2") WHERE "plugin_records"."ref_2" is not null;--> statement-breakpoint
ALTER TABLE "plugin_records" ADD CONSTRAINT "plugin_records_text1_length" CHECK (char_length("plugin_records"."text_1") <= 320);--> statement-breakpoint
ALTER TABLE "plugin_records" ADD CONSTRAINT "plugin_records_text2_length" CHECK (char_length("plugin_records"."text_2") <= 320);--> statement-breakpoint
ALTER TABLE "plugin_records" ADD CONSTRAINT "plugin_records_text3_length" CHECK (char_length("plugin_records"."text_3") <= 320);