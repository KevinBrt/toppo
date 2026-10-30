import { instancePermissionsOf } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { HOST_CALLS } from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq, isNull } from 'drizzle-orm';
import {
  permissionsIn,
  projectKeyOf,
  resolveProject,
} from '../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { pluginPersonOf } from '../utils/people/plugin-people.util.ts';
import { pluginOf } from '../utils/records/plugin-records.util.ts';

const { roles, users } = schema;

/**
 * Whether someone holds one of the plugin's own permissions (`ctx.people.can`): one of projects
 * in a project the plugin, and whoever it acts for, reaches; one of the instance through their
 * role. Acting for someone, of that person only; as itself, of any of its people. A deactivated
 * account holds none. Only its own permissions: Toppo's are no plugin's to read.
 */
export const checkPersonPermission = defineQuery({
  name: 'plugin.checkPersonPermission',
  access: 'authenticated',
  input: HOST_CALLS['people.can'].args,
  async handler({ db, actor }, { personId, permission: name, projectId }): Promise<boolean> {
    const plugin = pluginOf(actor);
    const permission = `${plugin.slug}.${name}`;
    const declared = actor.pluginPermissions.find((candidate) => candidate.name === permission);
    if (!declared) {
      throw new HttpError(404, 'PERMISSION_NOT_FOUND', `The plugin declares no permission ${name}`);
    }
    if ((declared.scope === 'project') !== (projectId !== undefined)) {
      throw new HttpError(
        400,
        'PERMISSION_SCOPE',
        declared.scope === 'project'
          ? `${name} is held in projects: name the project`
          : `${name} is held in the instance: name no project`,
      );
    }
    await pluginPersonOf(db, plugin, personId);
    const [person] = await db
      .select({ grantsAll: roles.grantsAll, permissions: roles.permissions })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.instanceRoleId))
      .where(and(eq(users.id, personId), isNull(users.deactivatedAt)));
    if (!person) {
      return false;
    }
    if (projectId === undefined) {
      return instancePermissionsOf(person, actor.pluginPermissions).includes(permission);
    }
    const project = await resolveProject(db, actor, await projectKeyOf(db, projectId));
    const held = await permissionsIn(db, personId, project.id, actor.pluginPermissions);
    return held?.includes(permission) ?? false;
  },
});
