import { schema } from '@toppo/db';
import { PROPERTIES_MAX, type PropertiesResponse, type PropertyRow } from '@toppo/shared';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { issues, properties, propertyOptions } = schema;

/**
 * Every property of the instance, oldest first, with its options in their order and how many
 * issues have each: removing one takes it off them. The projects' own are left to them.
 */
export const listProperties = defineQuery({
  name: 'property.list',
  access: { permission: 'instance.settings.manage' },
  input: z.object({}),
  async handler({ db }): Promise<PropertiesResponse> {
    const rows = await db
      .select({
        property: {
          id: properties.id,
          name: properties.name,
          type: properties.type,
          shownInList: properties.shownInList,
          askedAtCreation: properties.askedAtCreation,
          required: properties.required,
        },
        option: {
          id: propertyOptions.id,
          name: propertyOptions.name,
          color: propertyOptions.color,
          // Found through the index of the issues' values, one option at a time.
          issueCount: sql<number>`(
            select ${count()} from ${issues}
            where ${issues.properties} @> jsonb_build_object(${properties.id}::text, ${propertyOptions.id}::text)
          )`.mapWith(Number),
        },
      })
      .from(properties)
      .innerJoin(propertyOptions, eq(propertyOptions.propertyId, properties.id))
      // The projects' own properties and options are theirs.
      .where(and(isNull(properties.projectId), isNull(propertyOptions.projectId)))
      .orderBy(asc(properties.createdAt), asc(properties.id), asc(propertyOptions.position));
    const byId = new Map<string, PropertyRow>();
    for (const { property, option } of rows) {
      const row = byId.get(property.id) ?? { ...property, options: [] };
      row.options.push(option);
      byId.set(property.id, row);
    }
    return { properties: [...byId.values()].slice(0, PROPERTIES_MAX) };
  },
});
