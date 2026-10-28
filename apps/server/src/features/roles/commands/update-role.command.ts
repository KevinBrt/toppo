import { schema } from '@toppo-tracker/db';
import { roleIdParamsSchema, roleRequestSchema } from '@toppo-tracker/shared';
import { and, eq, ne, sql } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { roles } = schema;

/** Renames a role or changes its color. The system role stays as it is. */
export const updateRole = defineCommand({
  name: 'role.update',
  access: { permission: 'instance.roles.manage' },
  input: roleIdParamsSchema.extend(roleRequestSchema.shape),
  async handler({ tx, actor, log }, { roleId, name, color }): Promise<void> {
    // Every role locked until the transaction ends, as when creating one: the name is checked
    // against what a concurrent creation or rename wrote.
    const locked = await tx
      .select({ id: roles.id, grantsAll: roles.grantsAll })
      .from(roles)
      .for('update');
    const role = locked.find((candidate) => candidate.id === roleId);
    if (!role) {
      throw new HttpError(404, 'ROLE_NOT_FOUND', 'This role does not exist');
    }
    if (role.grantsAll) {
      throw new HttpError(403, 'SYSTEM_ROLE_LOCKED', 'The system role cannot be changed');
    }
    const [taken] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(sql`lower(${roles.name}) = lower(${name})`, ne(roles.id, roleId)));
    if (taken) {
      throw new HttpError(409, 'ROLE_NAME_TAKEN', 'Another role has this name');
    }

    await tx.update(roles).set({ name, color }).where(eq(roles.id, roleId));
    log.info({ roleId, by: actor.id }, 'Role updated');
  },
});
