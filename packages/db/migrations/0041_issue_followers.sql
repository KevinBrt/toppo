CREATE TABLE "issue_followers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"following" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_followers_unique" UNIQUE("issue_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_reason_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_muted_events_check";--> statement-breakpoint
ALTER TABLE "issue_followers" ADD CONSTRAINT "issue_followers_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_followers" ADD CONSTRAINT "issue_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_followers_user_id_idx" ON "issue_followers" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reason_check" CHECK ("notifications"."reason" in ('assigned', 'mentioned', 'participating', 'following', 'newIssue'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_muted_events_check" CHECK ("users"."email_muted_events" <@ array['created', 'assigned', 'assigneeChanged', 'commented', 'mentioned', 'statusChanged']::text[]);