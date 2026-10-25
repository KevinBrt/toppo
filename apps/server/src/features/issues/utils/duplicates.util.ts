import { formatIssueKey, parseIssueKey } from '@toppo/core';
import { type Db, schema } from '@toppo/db';
import {
  DUPLICATES_SHOWN,
  type IssueResponse,
  type LinkedIssue,
  projectKeySchema,
} from '@toppo/shared';
import { and, count, desc, eq, or, type SQL, sql } from 'drizzle-orm';
import { grantedIn, issuesSeenBy } from '../../../platform/auth/project-access.ts';

const { issues, projects, statuses } = schema;

type Reader = Pick<Db, 'select' | 'execute'>;

const HIDDEN: LinkedIssue = { key: null, title: null };

/**
 * The issues `userId` sees, as a condition on `issues` and `projects`: every issue where they
 * hold `issue.read`, those they reported where they hold `issue.read.own`.
 */
function seenBy(userId: string): SQL {
  return or(
    grantedIn(userId, ['issue.read']),
    and(eq(issues.reporterId, userId), grantedIn(userId, ['issue.read.own'])),
  ) as SQL;
}

const keyOf = (projectKey: string, number: number) =>
  formatIssueKey({ projectKey: projectKeySchema.parse(projectKey), number });

/** The issue `key` names, in any project, if `userId` sees it. */
export async function issueSeenBy(
  db: Reader,
  userId: string,
  key: string,
): Promise<{ id: string } | null> {
  const parts = parseIssueKey(key);
  if (!parts) {
    return null;
  }
  const [found] = await db
    .select({ id: issues.id })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(
      and(eq(projects.key, parts.projectKey), eq(issues.number, parts.number), seenBy(userId)),
    );
  return found ?? null;
}

/**
 * Issues by id as `userId` may know them: the key and title of those they see, `null`s for the
 * others, gone or out of their sight.
 */
export async function linkedIssues(
  db: Reader,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, LinkedIssue>> {
  const seen = await issuesSeenBy(db, userId, ids);
  return new Map(
    ids.map((id) => {
      const issue = seen.find((candidate) => candidate.id === id);
      return [id, issue ? { key: issue.key, title: issue.title } : HIDDEN];
    }),
  );
}

/**
 * Whether marking `issueId` as a duplicate of `originalId` would loop: the original is the issue
 * itself, or duplicates it, however far up the chain. Marks never loop, so the chain ends.
 */
export async function wouldLoop(db: Reader, issueId: string, originalId: string): Promise<boolean> {
  const [found] = await db.execute<{ loops: boolean }>(sql`
    with recursive chain as (
      select ${issues.id} as id, ${issues.duplicateOfId} as next
      from ${issues} where ${issues.id} = ${originalId}
      union
      select ${issues.id}, ${issues.duplicateOfId}
      from ${issues} join chain on ${issues.id} = chain.next
    )
    select exists (select 1 from chain where chain.id = ${issueId}) as loops
  `);
  return found?.loops === true;
}

/** What the page of an issue shows of another: its key, title and status. */
const LINK_COLUMNS = {
  number: issues.number,
  title: issues.title,
  projectKey: projects.key,
  status: {
    id: statuses.id,
    name: statuses.name,
    color: statuses.color,
    closes: statuses.closes,
  },
};

/** Issues `userId` sees, with what the page of another shows of them. */
function linksSeenBy(db: Reader, userId: string, among: SQL | undefined) {
  return db
    .select(LINK_COLUMNS)
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(statuses, eq(statuses.id, issues.statusId))
    .where(and(among, seenBy(userId)));
}

const linkOf = ({
  number,
  title,
  projectKey,
  status,
}: Awaited<ReturnType<typeof linksSeenBy>>[number]) => ({
  key: keyOf(projectKey, number),
  title,
  status,
});

/**
 * The issue `issueId` duplicates, as `userId` may know it, and its own duplicates that they see:
 * the latest first, up to `DUPLICATES_SHOWN`, and how many in all.
 */
export async function duplicatesAround(
  db: Reader,
  userId: string,
  issue: { id: string; duplicateOfId: string | null },
): Promise<Pick<IssueResponse, 'duplicateOf' | 'duplicates' | 'duplicateCount'>> {
  const theirs = and(eq(issues.duplicateOfId, issue.id), seenBy(userId));
  const [rows, [counted], [original]] = await Promise.all([
    linksSeenBy(db, userId, eq(issues.duplicateOfId, issue.id))
      .orderBy(desc(issues.updatedAt), desc(issues.id))
      .limit(DUPLICATES_SHOWN),
    db
      .select({ count: count() })
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(theirs),
    issue.duplicateOfId
      ? linksSeenBy(db, userId, eq(issues.id, issue.duplicateOfId))
      : Promise.resolve([]),
  ]);
  // Marked, the original shows; out of the reader's sight, as nothing they could know.
  const hidden = issue.duplicateOfId ? { ...HIDDEN, status: null } : null;
  return {
    duplicateOf: original ? linkOf(original) : hidden,
    duplicates: rows.map(linkOf),
    duplicateCount: counted?.count ?? 0,
  };
}
