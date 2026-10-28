import { schema, uuidv7 } from '@toppo-tracker/db';
import { ROLES_MAX, roleRequestSchema } from '@toppo-tracker/shared';
import { count, sql } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { roles } = schema;

/** Adds a role without any permission: the matrix gives it some afterwards. */
export const createRole = defineCommand({
  name: 'role.create',
  access: { permission: 'instance.roles.manage' },
  input: roleRequestSchema,
  async handler({ tx, actor, log }, { name, color }): Promise<{ id: string }> {
    // Every role locked until the transaction ends: creations and renames are serialized, so the
    // limit and the name are checked against what the other one wrote.
    await tx.select({ id: roles.id }).from(roles).for('update');
    const [existing] = await tx.select({ count: count() }).from(roles);
    if ((existing?.count ?? 0) >= ROLES_MAX) {
      throw new HttpError(409, 'ROLE_LIMIT_REACHED', `At most ${ROLES_MAX} roles`);
    }
    const [taken] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(sql`lower(${roles.name}) = lower(${name})`);
    if (taken) {
      throw new HttpError(409, 'ROLE_NAME_TAKEN', 'Another role has this name');
    }

    const id = uuidv7();
    await tx.insert(roles).values({ id, name, color });
    log.info({ roleId: id, by: actor.id }, 'Role created');
    return { id };
  },
});
