import { propertyValueOf, samePropertyValue, withPropertyValue } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { HOST_CALLS } from '@toppo-tracker/plugin-sdk/protocol';
import { issueKeyParamsSchema } from '@toppo-tracker/shared';
import { and, eq, sql } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { propertiesOf } from '../../../platform/plugins/plugin-properties.ts';
import { propertyRefusal } from '../utils/issue-properties.util.ts';

const { issues, properties } = schema;

/**
 * Gives an issue a value of a property its plugin alone writes, as the plugin asks it, on an
 * issue it, and whoever it acts for, sees; `null` (or `false` for a box) takes it away. Derived
 * from what the plugin keeps, which is its history, the value records no activity, and tells
 * no one: plugins never answer each other through it.
 */
export const setPluginProperty = defineCommand({
  name: 'issue.setPluginProperty',
  access: { project: 'issueKey', permission: 'issue.read' },
  input: issueKeyParamsSchema.extend(
    HOST_CALLS['issues.setProperty'].args.omit({ issueId: true }).shape,
  ),
  async handler({ tx, actor, project }, { property: name, value: given }): Promise<void> {
    if (!actor.plugin) {
      throw new HttpError(403, 'FORBIDDEN', 'A plugin writes its own properties');
    }
    // Share-locked: the property cannot be deleted while being given.
    const [property] = await tx
      .select({ id: properties.id, type: properties.type })
      .from(properties)
      .where(
        and(
          eq(properties.pluginSlug, actor.plugin.slug),
          eq(properties.pluginProperty, name),
          eq(properties.writtenBy, 'plugin'),
          propertiesOf(project.id),
        ),
      )
      .for('share');
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', `The plugin writes no property ${name} here`);
    }
    const taken =
      given === null || given === false
        ? { value: null }
        : propertyValueOf(
            { ...property, askedAtCreation: false, required: false, optionIds: [] },
            given,
          );
    if ('problem' in taken) {
      throw propertyRefusal(taken);
    }
    // The issue locked: two changes of its properties apply one after the other.
    const [row] = await tx
      .select({ properties: issues.properties })
      .from(issues)
      .where(eq(issues.id, project.issue.id))
      .for('update');
    const values = row?.properties ?? {};
    if (samePropertyValue(values[property.id] ?? null, taken.value)) {
      return;
    }
    // Neither its history nor when it was last changed: what people did to it stays as it was.
    await tx
      .update(issues)
      .set({
        properties: withPropertyValue(values, property.id, taken.value),
        updatedAt: sql`${issues.updatedAt}`,
      })
      .where(eq(issues.id, project.issue.id));
  },
});
