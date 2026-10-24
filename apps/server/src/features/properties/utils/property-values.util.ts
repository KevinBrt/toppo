import { schema } from '@toppo/db';
import type { IssueActivityPayload } from '@toppo/shared';
import { and, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { recordActivities } from '../../../platform/activities/record-activity.ts';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';

const { issues, properties } = schema;

/** Rows written at once: far below PostgreSQL's limit of parameters per statement. */
const BATCH = 1000;

/** The option an issue has of `propertyId`, as text: none when it has no value. */
const chosenOptionOf = (propertyId: string) =>
  sql<string>`${issues.properties} ->> ${propertyId}::text`;

/**
 * Takes options of a property off the issues having them, of one project or of every one, before
 * the options go; each issue is told in its history, which keeps the names. Answers how many
 * issues lost theirs.
 */
export async function takeOptionsOff(
  tx: Transaction,
  actorId: string,
  property: { id: string; name: string },
  options: readonly { id: string; name: string }[],
  { projectId }: { projectId?: string } = {},
): Promise<number> {
  if (options.length === 0) {
    return 0;
  }
  const having = await tx
    .select({ id: issues.id, projectId: issues.projectId, optionId: chosenOptionOf(property.id) })
    .from(issues)
    .where(
      and(
        inArray(
          chosenOptionOf(property.id),
          options.map(({ id }) => id),
        ),
        projectId === undefined ? undefined : eq(issues.projectId, projectId),
      ),
    )
    .for('update');
  for (let start = 0; start < having.length; start += BATCH) {
    const batch = having.slice(start, start + BATCH);
    await tx
      .update(issues)
      .set({ properties: sql`${issues.properties} - ${property.id}::text`, updatedAt: sql`now()` })
      .where(
        inArray(
          issues.id,
          batch.map(({ id }) => id),
        ),
      );
    // Recorded on each issue, told to nobody: someone tidying the properties.
    await recordActivities(
      tx,
      batch.map(({ id: issueId, projectId: issueProjectId, optionId }) => {
        const payload: IssueActivityPayload<'issue.propertyChanged'> = {
          property,
          from: options.find((option) => option.id === optionId) ?? null,
          to: null,
        };
        return {
          projectId: issueProjectId,
          issueId,
          actorId,
          type: 'issue.propertyChanged' as const,
          payload,
        };
      }),
      { notify: false },
    );
  }
  return having.length;
}

/**
 * Moves a project's issues from options to others, the same names under new ids (a project
 * taking copies of the instance's options): nothing changes as people see it, nothing is told.
 */
export async function moveValues(
  tx: Transaction,
  propertyId: string,
  projectId: string,
  moves: ReadonlyMap<string, string>,
): Promise<void> {
  for (const [from, to] of moves) {
    await tx
      .update(issues)
      .set({
        properties: sql`jsonb_set(${issues.properties}, array[${propertyId}::text], to_jsonb(${to}::text))`,
      })
      .where(and(eq(issues.projectId, projectId), eq(chosenOptionOf(propertyId), from)));
  }
}

/**
 * The property, of the instance (`projectId` null) or of one project, locked until the end of
 * the transaction, or `undefined` if there is none there.
 */
export async function lockedProperty(
  tx: Transaction,
  propertyId: string,
  projectId: string | null,
): Promise<{ id: string; name: string } | undefined> {
  const [property] = await tx
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(and(eq(properties.id, propertyId), ofScope(projectId)))
    .for('update');
  return property;
}

/** The properties of the instance, or of one project. */
export function ofScope(projectId: string | null): SQL {
  return projectId === null ? isNull(properties.projectId) : eq(properties.projectId, projectId);
}
