CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"webhook_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_event_type_known" CHECK ("webhook_deliveries"."event_type" in ('webhook.test', 'issue.created', 'issue.deleted', 'issue.titleChanged', 'issue.descriptionChanged', 'issue.statusChanged', 'issue.categoryChanged', 'issue.priorityChanged', 'issue.assigneeChanged', 'issue.labelsChanged', 'issue.propertyChanged', 'issue.duplicateChanged', 'issue.commented', 'issue.commentEdited', 'issue.commentDeleted', 'issue.attachmentAdded', 'issue.attachmentRemoved')),
	CONSTRAINT "webhook_deliveries_payload_object" CHECK (jsonb_typeof("webhook_deliveries"."payload") = 'object'),
	CONSTRAINT "webhook_deliveries_payload_size" CHECK (octet_length("webhook_deliveries"."payload"::text) <= 1048576),
	CONSTRAINT "webhook_deliveries_status_check" CHECK ("webhook_deliveries"."status" in ('pending', 'delivered', 'failed')),
	CONSTRAINT "webhook_deliveries_attempts_not_negative" CHECK ("webhook_deliveries"."attempts" >= 0),
	CONSTRAINT "webhook_deliveries_response_status_range" CHECK ("webhook_deliveries"."response_status" between 100 and 599),
	CONSTRAINT "webhook_deliveries_error_check" CHECK ("webhook_deliveries"."error" in ('ADDRESS_NOT_ALLOWED', 'TIMEOUT', 'RESPONSE_TOO_LARGE', 'TOO_MANY_REDIRECTS', 'NETWORK_ERROR', 'WEBHOOK_DISABLED', 'SECRET_UNREADABLE')),
	CONSTRAINT "webhook_deliveries_duration_not_negative" CHECK ("webhook_deliveries"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"webhook_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret_sealed" text NOT NULL,
	"events" text[] NOT NULL,
	"all_projects" boolean DEFAULT false NOT NULL,
	"allow_private" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhooks_name_length" CHECK (char_length("webhooks"."name") between 1 and 80),
	CONSTRAINT "webhooks_url_format" CHECK ("webhooks"."url" ~ '^https?://' and char_length("webhooks"."url") <= 2000),
	CONSTRAINT "webhooks_events_count" CHECK (cardinality("webhooks"."events") between 1 and 16),
	CONSTRAINT "webhooks_events_known" CHECK ("webhooks"."events" <@ array['issue.created', 'issue.deleted', 'issue.titleChanged', 'issue.descriptionChanged', 'issue.statusChanged', 'issue.categoryChanged', 'issue.priorityChanged', 'issue.assigneeChanged', 'issue.labelsChanged', 'issue.propertyChanged', 'issue.duplicateChanged', 'issue.commented', 'issue.commentEdited', 'issue.commentDeleted', 'issue.attachmentAdded', 'issue.attachmentRemoved']),
	CONSTRAINT "webhooks_failures_not_negative" CHECK ("webhooks"."failures" >= 0),
	CONSTRAINT "webhooks_last_error_length" CHECK (char_length("webhooks"."last_error") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_projects" ADD CONSTRAINT "webhook_projects_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_projects" ADD CONSTRAINT "webhook_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_id_created_at_idx" ON "webhook_deliveries" USING btree ("webhook_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_projects_webhook_project_unique" ON "webhook_projects" USING btree ("webhook_id","project_id");--> statement-breakpoint
CREATE INDEX "webhook_projects_project_id_idx" ON "webhook_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "webhooks_created_by_id_idx" ON "webhooks" USING btree ("created_by_id");