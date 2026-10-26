import { or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { Db } from './database.ts';

/**
 * At most this many words of a search count: enough for any title, and the full-text query
 * stays small whatever is typed.
 */
const SEARCH_WORDS_MAX = 10;

/** Shorter words are never corrected: too many others are one letter away. */
const CORRECTED_WORD_MIN_LENGTH = 4;

/**
 * Words issues have, by a word of a search they stand for, its typo corrected
 * (`similarWords`): searched along with it.
 */
export type SimilarWords = ReadonlyMap<string, readonly string[]>;

/**
 * "Éloïse" → "eloise", on both sides of a comparison: `fold_text()`, defined by the migrations
 * (`0023_search_folding`) so that indexes use the very same folding.
 */
function folded(value: SQLWrapper | string): SQL {
  return sql`fold_text(${value})`;
}

/** So that searching "50%" or "a_b" matches those very characters. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Rows where one of `columns` contains `term`, ignoring case and accents. The term travels as
 * a bound parameter with its `LIKE` wildcards escaped: what users type is never a pattern.
 */
export function containsText(columns: readonly SQLWrapper[], term: string): SQL | undefined {
  const pattern = folded(`%${escapeLike(term)}%`);
  return or(...columns.map((column) => sql`${folded(column)} like ${pattern}`));
}

/** The words of a search: its letters and digits, the first ten. */
function wordsOf(term: string): string[] {
  return term
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '')
    .slice(0, SEARCH_WORDS_MAX);
}

/**
 * The full-text query of `term`: each of its words as the start of a word, or one of the words
 * it stands for as the start of one ("tokn" finds "tokens"), all of them needed. Only letters and digits reach it, those of the words issues
 * have too, so what users type is never full-text syntax.
 */
function prefixQuery(term: string, similar: SimilarWords): SQL | undefined {
  const words = wordsOf(term);
  if (words.length === 0) {
    return undefined;
  }
  const query = words
    .map((word) => {
      const starts = [word, ...(similar.get(word) ?? [])].map((start) => `${start}:*`);
      return starts.length > 1 ? `(${starts.join(' | ')})` : `${word}:*`;
    })
    .join(' & ');
  return sql`to_tsquery('simple', ${folded(query)})`;
}

/**
 * Rows whose `vector`, a `tsvector` of text folded by `fold_text()`, has a word starting with
 * each word of `term`, or one of the words it stands for: "crash sav" finds "Crash on save",
 * "facutre" finds "facture" once `similar` says so. No condition when `term` has no word.
 */
export function matchesWords(
  vector: SQLWrapper,
  term: string,
  similar: SimilarWords = new Map(),
): SQL | undefined {
  const query = prefixQuery(term, similar);
  return query ? sql`${vector} @@ ${query}` : undefined;
}

/** How well `vector` matches the words of `term`, higher for heavier words; 0 without words. */
export function wordsRank(
  vector: SQLWrapper,
  term: string,
  similar: SimilarWords = new Map(),
): SQL<number> {
  const query = prefixQuery(term, similar);
  return query ? sql<number>`ts_rank(${vector}, ${query})` : sql<number>`0`;
}

/**
 * The words issues of `projectIds` have closest to each word of `term` that none of theirs has
 * nor starts with, by the word typed: one letter off in four or five, two beyond
 * (`similar_issue_words()`, migration 0044). Only projects whose every issue the searcher reads:
 * the words of others would tell what issues out of reach say. Words issues have, short words and
 * words without a close one are left out.
 */
export async function similarWords(
  db: Pick<Db, 'execute'>,
  term: string,
  projectIds: readonly string[],
): Promise<SimilarWords> {
  const words = wordsOf(term).filter((word) => word.length >= CORRECTED_WORD_MIN_LENGTH);
  if (words.length === 0 || projectIds.length === 0) {
    return new Map();
  }
  const projects = sql.join(
    projectIds.map((projectId) => sql`${projectId}`),
    sql`, `,
  );
  const typed = sql.join(
    words.map((word) => sql`${word}`),
    sql`, `,
  );
  const rows = await db.execute<{ typed: string; similar: string[] }>(sql`
    select typed,
      array(select similar_issue_words(fold_text(typed), array[${projects}]::uuid[])) as similar
    from unnest(array[${typed}]::text[]) as typed
  `);
  return new Map(
    [...rows].flatMap(({ typed: word, similar }) => (similar.length > 0 ? [[word, similar]] : [])),
  );
}
