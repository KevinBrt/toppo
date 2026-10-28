import { containsText, schema } from '@toppo-tracker/db';
import {
  type AssigneesResponse,
  PICKER_RESULTS_MAX,
  pickerQuerySchema,
  projectIssuesParamsSchema,
} from '@toppo-tracker/shared';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { projectMembers, roles, users } = schema;

/** The first active members matching a search who reach the project: those issues can be given to. */
export const listAssignees = defineQuery({
  name: 'issue.listAssignees',
  access: { project: 'projectKey', permission: 'issue.assign' },
  input: projectIssuesParamsSchema.extend(pickerQuerySchema.shape),
  async handler({ db, project }, { search }): Promise<AssigneesResponse> {
    const people = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.instanceRoleId))
      .where(
        and(
          isNull(users.deletedAt),
          isNull(users.deactivatedAt),
          or(
            eq(roles.grantsAll, true),
            eq(users.allProjects, true),
            sql`exists (select 1 from ${projectMembers}
              where ${projectMembers.projectId} = ${project.id}
                and ${projectMembers.userId} = ${users.id})`,
          ),
          search ? containsText([users.name, users.email], search) : undefined,
        ),
      )
      .orderBy(sql`lower(${users.name})`, users.id)
      .limit(PICKER_RESULTS_MAX);
    return { people };
  },
});
