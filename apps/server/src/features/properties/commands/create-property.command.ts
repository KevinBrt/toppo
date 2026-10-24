import { isUniqueViolation, schema, uuidv7 } from '@toppo/db';
import { createPropertyRequestSchema, PROPERTIES_MAX } from '@toppo/shared';
import { count, sql } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { properties, propertyOptions } = schema;

/** Arbitrary but fixed: two properties created at once are counted one after the other. */
const PROPERTIES_LOCK_KEY = 7_461_756_331;

/**
 * Adds a property to the instance, with its options in their order: every project's issues may
 * take it from now on. Answers its id.
 */
export const createProperty = defineCommand({
  name: 'property.create',
  access: { permission: 'instance.settings.manage' },
  input: createPropertyRequestSchema,
  async handler({ tx, actor, log }, { options, ...fields }): Promise<{ id: string }> {
    await tx.execute(sql`select pg_advisory_xact_lock(${PROPERTIES_LOCK_KEY})`);
    const [existing] = await tx.select({ count: count() }).from(properties);
    if ((existing?.count ?? 0) >= PROPERTIES_MAX) {
      throw new HttpError(
        409,
        'PROPERTY_LIMIT_REACHED',
        `An instance has at most ${PROPERTIES_MAX} properties`,
      );
    }
    const id = uuidv7();
    try {
      await tx.insert(properties).values({ id, ...fields });
    } catch (error) {
      if (isUniqueViolation(error, 'properties_name_unique')) {
        throw new HttpError(409, 'PROPERTY_NAME_TAKEN', 'Another property has this name');
      }
      throw error;
    }
    await tx.insert(propertyOptions).values(
      options.map(({ name, color }, position) => ({
        id: uuidv7(),
        propertyId: id,
        name,
        color,
        position,
      })),
    );
    log.info({ propertyId: id, options: options.length, by: actor.id }, 'Property created');
    return { id };
  },
});
