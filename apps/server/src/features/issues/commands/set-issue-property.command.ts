import {
  can,
  optionsIn,
  peopleNamedIn,
  propertyChangeOf,
  propertyValueOf,
  samePropertyValue,
  withPropertyValue,
} from '@toppo/core';
import { schema } from '@toppo/db';
import {
  issuePropertyParamsSchema,
  issuePropertyRequestSchema,
  type PropertyType,
  type PropertyValue,
} from '@toppo/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { activity } from '../utils/activities.util.ts';
import {
  assertNameable,
  lockedPropertyRules,
  propertyRefusal,
} from '../utils/issue-properties.util.ts';

const { issues, propertyOptions } = schema;

/**
 * Gives an issue a value of a property of its project, or takes its value away (`issue.update`):
 * one of its options, a line of text, someone who reaches the project (`issue.assign` too)… The
 * activity keeps the options by their names now; nothing changes, nothing is told.
 */
export const setIssueProperty = defineCommand({
  name: 'issue.setProperty',
  access: { project: 'issueKey', permission: 'issue.update' },
  input: issuePropertyParamsSchema.extend(issuePropertyRequestSchema.shape),
  async handler({ tx, actor, project, log }, { propertyId, value: given }): Promise<void> {
    const { issue } = project;
    // Share-locked: the options cannot be deleted while being given.
    const property = (await lockedPropertyRules(tx, project.id)).find(
      ({ id }) => id === propertyId,
    );
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    // Naming someone is choosing among those who may be assigned.
    if (property.type === 'user' && !can(project.permissions, 'issue.assign')) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to name people here');
    }
    const taken = given === null ? { value: null } : propertyValueOf(property, given);
    if ('problem' in taken) {
      throw propertyRefusal(taken);
    }
    // The issue locked: two changes of its properties apply one after the other.
    const [row] = await tx
      .select({ properties: issues.properties })
      .from(issues)
      .where(eq(issues.id, issue.id))
      .for('update');
    const values = row?.properties ?? {};
    const current = values[propertyId] ?? null;
    if (samePropertyValue(current, taken.value)) {
      return;
    }
    if (taken.value !== null) {
      await assertNameable(
        tx,
        project.id,
        peopleNamedIn([property], { [propertyId]: taken.value }),
      );
    }
    await tx
      .update(issues)
      .set({
        properties: withPropertyValue(values, propertyId, taken.value),
        updatedAt: sql`now()`,
      })
      .where(eq(issues.id, issue.id));
    await recordActivity(tx, {
      projectId: project.id,
      issueId: issue.id,
      actorId: actor.id,
      ...activity(
        'issue.propertyChanged',
        propertyChangeOf(
          property,
          current,
          taken.value,
          await optionNames(tx, property.type, [current, taken.value]),
        ),
      ),
    });
    log.info({ issueId: issue.id, propertyId, by: actor.id }, 'Issue property changed');
  },
});

/** The names of the options values choose, wherever the options belong. */
async function optionNames(
  tx: Transaction,
  type: PropertyType,
  values: readonly (PropertyValue | null)[],
): Promise<Map<string, string>> {
  const ids = values.flatMap((value) => (value === null ? [] : optionsIn(type, value)));
  if (ids.length === 0) {
    return new Map();
  }
  const named = await tx
    .select({ id: propertyOptions.id, name: propertyOptions.name })
    .from(propertyOptions)
    .where(inArray(propertyOptions.id, ids));
  return new Map(named.map(({ id, name }) => [id, name]));
}
