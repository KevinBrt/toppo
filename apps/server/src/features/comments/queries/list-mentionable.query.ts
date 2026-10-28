import { roleInProject } from '@toppo-tracker/core';
import { containsText, schema } from '@toppo-tracker/db';
import {
  issueKeyParamsSchema,
  type MentionableResponse,
  PICKER_RESULTS_MAX,
  pickerQuerySchema,
} from '@toppo-tracker/shared';
import { and, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { mentionableIn } from '../utils/mentions.util.ts';

const { projectMembers, roles, users } = schema;
const instanceRoles = alias(roles, 'instance_roles');
const memberRoles = alias(roles, 'member_roles');

/**
 * The first people matching a name whom a comment on the issue may name, its author aside, each
 * with the role they work with in the project (`roleInProject`).
 */
export const listMentionable = defineQuery({
  name: 'comment.listMentionable',
  access: { project: 'issueKey', permission: 'comment.create' },
  input: issueKeyParamsSchema.extend(pickerQuerySchema.shape),
  async handler({ db, actor, project }, { search }): Promise<MentionableResponse> {
    const people = await db
      .select({
        id: users.id,
        name: users.name,
        ownRole: {
          id: instanceRoles.id,
          name: instanceRoles.name,
          color: instanceRoles.color,
          grantsAll: instanceRoles.grantsAll,
        },
        givenRole: {
          id: memberRoles.id,
          name: memberRoles.name,
          color: memberRoles.color,
          grantsAll: memberRoles.grantsAll,
        },
      })
      .from(users)
      .innerJoin(instanceRoles, eq(instanceRoles.id, users.instanceRoleId))
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, users.id)),
      )
      .leftJoin(memberRoles, eq(memberRoles.id, projectMembers.roleId))
      .where(
        and(
          ne(users.id, actor.id),
          mentionableIn(project),
          search ? containsText([users.name], search) : undefined,
        ),
      )
      .orderBy(sql`lower(${users.name})`, users.id)
      .limit(PICKER_RESULTS_MAX);
    return {
      people: people.map(({ id, name, ownRole, givenRole }) => {
        const { grantsAll: _, ...shown } = roleInProject(ownRole, givenRole);
        return { id, name, role: shown };
      }),
    };
  },
});
