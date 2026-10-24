import { withPropertyValue } from '@toppo/core';
import { schema } from '@toppo/db';
import { issuePropertyParamsSchema, issuePropertyRequestSchema } from '@toppo/shared';
import { and, eq, sql } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { activity } from '../utils/activities.util.ts';

const { issues, properties, propertyOptions } = schema;

/**
 * Gives an issue an option of a property, or takes its value away (`issue.update`). The activity
 * names the property and the options as they are now; nothing changes, nothing is told.
 */
export const setIssueProperty = defineCommand({
  name: 'issue.setProperty',
  access: { project: 'issueKey', permission: 'issue.update' },
  input: issuePropertyParamsSchema.extend(issuePropertyRequestSchema.shape),
  async handler({ tx, actor, project, log }, { propertyId, optionId }): Promise<void> {
    const { issue } = project;
    // Share-locked: the property and the option cannot be deleted while being given.
    const [property] = await tx
      .select({ id: properties.id, name: properties.name })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .for('share');
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    const option = optionId === null ? null : await lockedOption(tx, propertyId, optionId);
    // The issue locked: two changes of its properties apply one after the other.
    const [row] = await tx
      .select({ properties: issues.properties })
      .from(issues)
      .where(eq(issues.id, issue.id))
      .for('update');
    const values = row?.properties ?? {};
    const currentId = values[propertyId] ?? null;
    if (currentId === optionId) {
      return;
    }
    const [current] =
      currentId === null
        ? []
        : await tx
            .select({ id: propertyOptions.id, name: propertyOptions.name })
            .from(propertyOptions)
            .where(eq(propertyOptions.id, currentId));
    await tx
      .update(issues)
      .set({ properties: withPropertyValue(values, propertyId, optionId), updatedAt: sql`now()` })
      .where(eq(issues.id, issue.id));
    await recordActivity(tx, {
      projectId: project.id,
      issueId: issue.id,
      actorId: actor.id,
      ...activity('issue.propertyChanged', { property, from: current ?? null, to: option }),
    });
    log.info({ issueId: issue.id, propertyId, optionId, by: actor.id }, 'Issue property changed');
  },
});

async function lockedOption(
  tx: Transaction,
  propertyId: string,
  optionId: string,
): Promise<{ id: string; name: string }> {
  const [option] = await tx
    .select({ id: propertyOptions.id, name: propertyOptions.name })
    .from(propertyOptions)
    .where(and(eq(propertyOptions.id, optionId), eq(propertyOptions.propertyId, propertyId)))
    .for('share');
  if (!option) {
    throw new HttpError(400, 'INVALID_PROPERTY_OPTION', 'This option is not one of the property');
  }
  return option;
}
