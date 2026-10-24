import { schema } from '@toppo/db';
import type { IssueActivityPayload } from '@toppo/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { recordActivities } from '../../../platform/activities/record-activity.ts';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';

const { issues } = schema;

/** Rows written at once: far below PostgreSQL's limit of parameters per statement. */
const BATCH = 1000;

/**
 * Takes options of a property off the issues having them, before they are deleted, each issue
 * told in its history, which keeps the names; answers how many issues lost theirs.
 */
export async function takeOptionsOff(
  tx: Transaction,
  actorId: string,
  property: { id: string; name: string },
  options: readonly { id: string; name: string }[],
): Promise<number> {
  if (options.length === 0) {
    return 0;
  }
  const chosenOption = sql<string>`${issues.properties} ->> ${property.id}::text`;
  const having = await tx
    .select({ id: issues.id, projectId: issues.projectId, optionId: chosenOption })
    .from(issues)
    .where(
      inArray(
        chosenOption,
        options.map(({ id }) => id),
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
    // Recorded on each issue, told to nobody: an administrator tidying the properties.
    await recordActivities(
      tx,
      batch.map(({ id: issueId, projectId, optionId }) => {
        const payload: IssueActivityPayload<'issue.propertyChanged'> = {
          property,
          from: options.find((option) => option.id === optionId) ?? null,
          to: null,
        };
        return { projectId, issueId, actorId, type: 'issue.propertyChanged' as const, payload };
      }),
      { notify: false },
    );
  }
  return having.length;
}

/** The property, locked until the end of the transaction, or `undefined` if there is none. */
export async function lockedProperty(
  tx: Transaction,
  propertyId: string,
): Promise<{ id: string; name: string } | undefined> {
  const [property] = await tx
    .select({ id: schema.properties.id, name: schema.properties.name })
    .from(schema.properties)
    .where(eq(schema.properties.id, propertyId))
    .for('update');
  return property;
}
