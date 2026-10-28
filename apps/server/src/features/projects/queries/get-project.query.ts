import { schema } from '@toppo-tracker/db';
import { type ProjectResponse, projectKeyParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { projects } = schema;

/** A project the caller reaches, with what they may do in it. */
export const getProject = defineQuery({
  name: 'project.get',
  access: { project: 'projectKey' },
  input: projectKeyParamsSchema,
  async handler({ db, project }): Promise<ProjectResponse> {
    const [row] = await db
      .select({
        name: projects.name,
        description: projects.description,
        color: projects.color,
        nextIssueNumber: projects.nextIssueNumber,
      })
      .from(projects)
      .where(eq(projects.id, project.id));
    if (!row) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'This project does not exist');
    }
    return {
      id: project.id,
      key: project.key,
      name: row.name,
      description: row.description,
      color: row.color,
      archived: project.archived,
      keyEditable: row.nextIssueNumber === 1,
      permissions: [...project.permissions],
    };
  },
});
