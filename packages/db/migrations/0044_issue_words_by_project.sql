-- The words typos are corrected to, project by project: a correction is made only from the
-- projects whose issues the searcher reads, so that whether it comes, and what it offers, never
-- tells what an issue out of reach says. Each word kept goes, with its id, to one project whose
-- issues have it; one no issue has any more goes. The search.rebuildWords job, brought forward to
-- the first start, adds the word to the other projects having it: ids are UUID v7, made by the
-- app, which PostgreSQL 16 cannot.

DROP INDEX "issue_words_word_unique";--> statement-breakpoint
ALTER TABLE "issue_words" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "issue_words" SET "project_id" = "found"."project_id"
FROM (
  SELECT DISTINCT ON ("written"."word") "written"."word", "issues"."project_id"
  FROM "issues", unnest("issues"."search_vector") AS "written"("word", "positions", "weights")
  ORDER BY "written"."word", "issues"."project_id"
) AS "found"
WHERE "found"."word" = "issue_words"."word";--> statement-breakpoint
DELETE FROM "issue_words" WHERE "project_id" IS NULL;--> statement-breakpoint
ALTER TABLE "issue_words" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
UPDATE "jobs" SET "run_at" = now() WHERE "type" = 'search.rebuildWords' AND "status" = 'pending';--> statement-breakpoint
ALTER TABLE "issue_words" ADD CONSTRAINT "issue_words_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_words_project_word_unique" ON "issue_words" USING btree ("project_id","word");--> statement-breakpoint
DROP FUNCTION similar_issue_words(text);--> statement-breakpoint
CREATE FUNCTION similar_issue_words(term text, project_ids uuid[]) RETURNS SETOF text
  LANGUAGE sql STABLE
  SET pg_trgm.similarity_threshold = 0.2
AS $$
  SELECT candidate.word
  FROM issue_words AS candidate
  WHERE term ~ '^[[:alnum:]]{4,}$'
    AND candidate.project_id = ANY (project_ids)
    AND NOT EXISTS (
      SELECT 1 FROM issue_words AS known
      WHERE known.project_id = ANY (project_ids) AND known.word LIKE term || '%'
    )
    AND candidate.word % term
    AND levenshtein_less_equal(candidate.word, term, CASE WHEN length(term) <= 5 THEN 1 ELSE 2 END)
      <= CASE WHEN length(term) <= 5 THEN 1 ELSE 2 END
  GROUP BY candidate.word
  ORDER BY levenshtein(candidate.word, term), candidate.word
  LIMIT 3
$$;
