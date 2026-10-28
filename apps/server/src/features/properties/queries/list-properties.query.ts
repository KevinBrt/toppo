import { schema } from '@toppo-tracker/db';
import { PROPERTIES_MAX, type PropertiesResponse } from '@toppo-tracker/shared';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { issuesChoosing, issuesWithValue } from '../utils/property-counts.util.ts';

const { issues, properties, propertyOptions } = schema;

/**
 * Every property of the instance, oldest first, with how many issues have a value of it, and its
 * options in their order with how many issues have each: removing one takes it off them. The
 * projects' own are left to them.
 */
export const listProperties = defineQuery({
  name: 'property.list',
  access: { permission: 'instance.settings.manage' },
  input: z.object({}),
  async handler({ db }): Promise<PropertiesResponse> {
    const defined = await db
      .select({
        id: properties.id,
        name: properties.name,
        type: properties.type,
        shownInList: properties.shownInList,
        askedAtCreation: properties.askedAtCreation,
        required: properties.required,
        issueCount: count(issues.id),
      })
      .from(properties)
      .leftJoin(issues, issuesWithValue())
      .where(isNull(properties.projectId))
      .groupBy(properties.id)
      .orderBy(asc(properties.createdAt), asc(properties.id))
      .limit(PROPERTIES_MAX);
    const options =
      defined.length === 0
        ? []
        : await db
            .select({
              propertyId: propertyOptions.propertyId,
              id: propertyOptions.id,
              name: propertyOptions.name,
              color: propertyOptions.color,
              issueCount: issuesChoosing(),
            })
            .from(propertyOptions)
            .innerJoin(properties, eq(properties.id, propertyOptions.propertyId))
            .where(
              and(
                inArray(
                  propertyOptions.propertyId,
                  defined.map(({ id }) => id),
                ),
                // The projects' own options are theirs.
                isNull(propertyOptions.projectId),
              ),
            )
            .orderBy(asc(propertyOptions.position));
    return {
      properties: defined.map((property) => ({
        ...property,
        options: options
          .filter(({ propertyId }) => propertyId === property.id)
          .map(({ propertyId: _, ...option }) => option),
      })),
    };
  },
});
