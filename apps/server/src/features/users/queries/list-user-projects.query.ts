import { containsText, schema } from '@toppo-tracker/db';
import {
  PICKER_RESULTS_MAX,
  pickerQuerySchema,
  type UserProjectsResponse,
  userIdParamsSchema,
} from '@toppo-tracker/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { reachableBy } from '../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { projectMembers, projects, users } = schema;

/**
 * A member's access to projects: every project, or those they are in. Only projects the caller
 * reaches are listed, so managing members never reveals a project one does not know of.
 */
export const listUserProjects = defineQuery({
  name: 'user.listProjects',
  access: { permission: 'instance.users.manage' },
  input: userIdParamsSchema.extend(pickerQuerySchema.shape),
  async handler({ db, actor }, { userId, search }): Promise<UserProjectsResponse> {
    const [user] = await db
      .select({ allProjects: users.allProjects })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'This user does not exist');
    }
    const rows = await db
      .select({ key: projects.key, name: projects.name, membershipId: projectMembers.id })
      .from(projects)
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
      )
      .where(
        and(
          reachableBy(actor.id),
          isNull(projects.archivedAt),
          search ? containsText([projects.key, projects.name], search) : undefined,
        ),
      )
      .orderBy(sql`${projectMembers.id} is null`, sql`lower(${projects.name})`, projects.key)
      .limit(PICKER_RESULTS_MAX);
    return {
      allProjects: user.allProjects,
      rows: rows.map(({ key, name, membershipId }) => ({
        key,
        name,
        member: membershipId !== null,
      })),
    };
  },
});
