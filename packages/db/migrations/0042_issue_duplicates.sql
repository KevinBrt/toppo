ALTER TABLE "users" DROP CONSTRAINT "users_email_muted_events_check";--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "duplicate_of_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_duplicate_of_id_issues_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_duplicate_of_id_idx" ON "issues" USING btree ("duplicate_of_id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_not_duplicate_of_itself" CHECK ("issues"."duplicate_of_id" <> "issues"."id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_muted_events_check" CHECK ("users"."email_muted_events" <@ array['created', 'assigned', 'assigneeChanged', 'commented', 'mentioned', 'statusChanged', 'duplicateChanged']::text[]);