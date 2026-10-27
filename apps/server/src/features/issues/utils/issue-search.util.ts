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

/**
 * The words of issues kept for correcting searches: letters and digits, four to 32. A longer one
 * is no word anyone types, and past 255 `levenshtein()` refuses it, failing the search.
 */
const KEPT_WORD = sql`'^[[:alnum:]]{4,32}$'`;

/**
 * The most an issue adds, its title's words and then its most used first: an issue written to swell the list (tens of
 * thousands of made-up words) would otherwise slow every correction, and each night's rebuild.
 */
const WORDS_PER_ISSUE = 300;

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
 * Adds the words of an issue's title and description to those searches in its project are
 * corrected to, once the issue is written: in its transaction, so that a typo finds it at once.
 */
export async function rememberWords(tx: Transaction, issueId: string): Promise<void> {
  const found = await tx.execute<{ projectId: string; word: string }>(sql`
    select project_id as "projectId", word from (${keptWords(eq(issues.id, issueId))}) as kept
  `);
  await addWords(tx, [...found]);
}

/**
 * Makes the words searches in a project are corrected to those of its issues as they are, a word
 * none has any more gone. One project at a time, in a transaction of its own: never the whole
 * instance's words in memory, nor locked, at once. Answers how many words the project has.
 */
export async function rebuildProjectWords(tx: Transaction, projectId: string): Promise<number> {
  const written = keptWords(eq(issues.projectId, projectId));
  await tx.execute(sql`
    delete from ${issueWords}
    where ${issueWords.projectId} = ${projectId}
      and ${issueWords.word} not in (select word from (${written}) as kept)
  `);
  const found = await tx.execute<{ projectId: string; word: string }>(sql`
    select project_id as "projectId", word from (${written}) as kept
  `);
  await addWords(tx, [...found]);
  return found.length;
}

/**
 * The words kept of the issues `which` selects, with their project: each issue's title first,
 * then its most used words.
 */
function keptWords(which: SQL | undefined): SQL {
  return sql`
    select distinct ${issues.projectId} as project_id, kept.word
    from ${issues}
    cross join lateral (
      select written.word
      from unnest(${issues.searchVector}) as written(word, positions, weights)
      where written.word ~ ${KEPT_WORD}
      order by 'A' = any(written.weights) desc,
        coalesce(array_length(written.positions, 1), 0) desc,
        written.word
      limit ${WORDS_PER_ISSUE}
    ) as kept
    where ${which}
  `;
}

interface ProjectWord {
  projectId: string;
  word: string;
}

async function addWords(tx: Transaction, words: readonly ProjectWord[]): Promise<void> {
  for (let start = 0; start < words.length; start += BATCH) {
    await tx
      .insert(issueWords)
      .values(words.slice(start, start + BATCH).map((word) => ({ id: uuidv7(), ...word })))
      .onConflictDoNothing({ target: [issueWords.projectId, issueWords.word] });
  }
}
