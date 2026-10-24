-- Search that forgives typos. similar_issue_words() gives the words of issue_words closest to a
-- typed word that no issue has, nor starts with: at most one letter changed, added, removed for
-- a word of four or five letters, two beyond, so that two letters swapped ("facutre") count, the
-- closest first. A word issues have, or begin with, is never corrected: "export" stays "export",
-- never "import". Candidates come from the trigram index of issue_words, under a threshold low
-- enough for two letters swapped (0.33 for "facutre"); the edit distance then decides.
--
-- fuzzystrmatch ships with PostgreSQL and is trusted, like pg_trgm: the owner of the database may
-- create it. issue_words is filled by the server's search.rebuildWords job, at its first start.

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
--> statement-breakpoint
CREATE FUNCTION similar_issue_words(term text) RETURNS SETOF text
  LANGUAGE sql STABLE
  SET pg_trgm.similarity_threshold = 0.2
AS $$
  SELECT candidate.word
  FROM issue_words AS candidate
  WHERE term ~ '^[[:alnum:]]{4,}$'
    AND NOT EXISTS (SELECT 1 FROM issue_words AS known WHERE known.word LIKE term || '%')
    AND candidate.word % term
    AND levenshtein_less_equal(candidate.word, term, CASE WHEN length(term) <= 5 THEN 1 ELSE 2 END)
      <= CASE WHEN length(term) <= 5 THEN 1 ELSE 2 END
  ORDER BY levenshtein(candidate.word, term), candidate.word
  LIMIT 3
$$;
