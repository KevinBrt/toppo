CREATE TABLE "issue_words" (
	"id" uuid PRIMARY KEY NOT NULL,
	"word" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_words_word_plain" CHECK ("issue_words"."word" ~ '^[[:alnum:]]{4,}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "issue_words_word_unique" ON "issue_words" USING btree ("word");--> statement-breakpoint
CREATE INDEX "issue_words_word_trigram_idx" ON "issue_words" USING gin ("word" gin_trgm_ops);