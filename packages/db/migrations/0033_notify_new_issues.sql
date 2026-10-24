ALTER TABLE "notifications" DROP CONSTRAINT "notifications_reason_check";--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "notify_new_issues" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reason_check" CHECK ("notifications"."reason" in ('assigned', 'mentioned', 'participating', 'newIssue'));