ALTER TABLE "users" ADD COLUMN "email_muted_events" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_notifications";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_muted_events_check" CHECK ("users"."email_muted_events" <@ array['created', 'assigned', 'commented', 'mentioned', 'statusChanged']::text[]);