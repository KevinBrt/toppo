-- Jobs get a priority, higher first among those due: a password reset, then an invitation, never
-- wait behind a flood of notifications. Words kept for correcting typos are 32 characters at most:
-- longer ones make levenshtein() fail past 255, and let one issue swell the list.

ALTER TABLE "issue_words" DROP CONSTRAINT "issue_words_word_plain";--> statement-breakpoint
DELETE FROM "issue_words" WHERE length("word") > 32;--> statement-breakpoint
DROP INDEX "jobs_pending_run_at_idx";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "jobs" SET "priority" = 2 WHERE "type" = 'password-reset.email';--> statement-breakpoint
UPDATE "jobs" SET "priority" = 1 WHERE "type" = 'invitation.email';--> statement-breakpoint
CREATE INDEX "jobs_pending_priority_run_at_idx" ON "jobs" USING btree ("priority" DESC NULLS LAST,"run_at") WHERE "jobs"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "issue_words" ADD CONSTRAINT "issue_words_word_plain" CHECK ("issue_words"."word" ~ '^[[:alnum:]]{4,32}$');--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_priority_check" CHECK ("jobs"."priority" >= 0);