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
 * Adds the words of an issue's title and description to those searches in its project are
 * corrected to, once the issue is written: in its transaction, so that a typo finds it at once.
 */
export async function rememberWords(tx: Transaction, issueId: string): Promise<void> {
  const found = await tx.execute<{ projectId: string; word: string }>(sql`
    select distinct ${issues.projectId} as "projectId", written.word
    from ${issues}, unnest(${issues.searchVector}) as written(word, positions, weights)
    where ${eq(issues.id, issueId)} and written.word ~ ${KEPT_WORD}
  `);
  await addWords(tx, [...found]);
}

/**
 * Makes the words searches are corrected to those of the issues as they are, project by project,
 * a word no issue of a project has any more gone from it. Answers how many words they have.
 */
export async function rebuildWords(tx: Transaction): Promise<number> {
  const written = sql`
    select distinct ${issues.projectId} as project_id, written.word
    from ${issues}, unnest(${issues.searchVector}) as written(word, positions, weights)
    where written.word ~ ${KEPT_WORD}
  `;
  await tx.execute(sql`
    delete from ${issueWords}
    where (${issueWords.projectId}, ${issueWords.word}) not in (select project_id, word from (${written}) as kept)
  `);
  const found = await tx.execute<{ projectId: string; word: string }>(sql`
    select project_id as "projectId", word from (${written}) as kept
  `);
  await addWords(tx, [...found]);
  return found.length;
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
