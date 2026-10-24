import {
  containsText,
  matchesWords,
  type SimilarWords,
  schema,
  uuidv7,
  wordsRank,
} from '@toppo/db';
import { eq, or, type SQL, sql } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';

const { issues, issueWords } = schema;

/** Words added at once: far below PostgreSQL's limit of parameters per statement. */
const BATCH = 1000;

/** The words of issues kept for correcting searches: letters and digits, four at least. */
const KEPT_WORD = sql`'^[[:alnum:]]{4,}$'`;

/**
 * Issues whose text a search finds: words of their title or description starting with the words
 * typed, or with those a typo stands for (`similar`), or their title containing what was typed,
 * even inside a word or a path (`/api/login`).
 */
export function textMatching(search: string, similar: SimilarWords): SQL | undefined {
  return or(
    matchesWords(issues.searchVector, search, similar),
    containsText([issues.title], search),
  );
}

/**
 * Whether an issue has the words typed, as typed: those come before the ones found through a
 * corrected typo.
 */
export function typedMatching(search: string): SQL<boolean> {
  return sql<boolean>`coalesce(${matchesWords(issues.searchVector, search) ?? sql`false`}, false)`;
}

/** How well an issue's words match a search, its title weighing more than its description. */
export function textRank(search: string, similar: SimilarWords): SQL<number> {
  return wordsRank(issues.searchVector, search, similar);
}

/**
 * Adds the words of an issue's title and description to those searches are corrected to, once
 * the issue is written: in its transaction, so that a typo finds it at once.
 */
export async function rememberWords(tx: Transaction, issueId: string): Promise<void> {
  const found = await tx.execute<{ word: string }>(sql`
    select distinct written.word
    from ${issues}, unnest(${issues.searchVector}) as written(word, positions, weights)
    where ${eq(issues.id, issueId)} and written.word ~ ${KEPT_WORD}
  `);
  await addWords(
    tx,
    [...found].map(({ word }) => word),
  );
}

/**
 * Makes the words searches are corrected to those of the issues as they are, a word no issue
 * has any more gone. Answers how many words issues have.
 */
export async function rebuildWords(tx: Transaction): Promise<number> {
  const written = sql`select word from ts_stat('select search_vector from issues')`;
  await tx.execute(sql`
    delete from ${issueWords} where ${issueWords.word} not in (${written})
  `);
  const found = await tx.execute<{ word: string }>(sql`
    select word from (${written}) as written where word ~ ${KEPT_WORD}
  `);
  const words = [...found].map(({ word }) => word);
  await addWords(tx, words);
  return words.length;
}

async function addWords(tx: Transaction, words: readonly string[]): Promise<void> {
  for (let start = 0; start < words.length; start += BATCH) {
    await tx
      .insert(issueWords)
      .values(words.slice(start, start + BATCH).map((word) => ({ id: uuidv7(), word })))
      .onConflictDoNothing({ target: issueWords.word });
  }
}
