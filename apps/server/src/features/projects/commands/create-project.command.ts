import { projectColorFor } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import { createProjectRequestSchema } from '@toppo-tracker/shared';
import { count } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { projectMembers, projects } = schema;

/**
 * Creates a project, in the next color of the palette; whoever creates it gets access to it, with
 * their own role.
 */
export const createProject = defineCommand({
  name: 'project.create',
  access: { permission: 'project.create' },
  input: createProjectRequestSchema,
  async handler(
    { tx, actor, log },
    { key, name, description },
  ): Promise<{ id: string; key: string }> {
    const id = uuidv7();
    // Archived projects count too: colors keep turning however projects come and go.
    const [existing] = await tx.select({ count: count() }).from(projects);
    const color = projectColorFor(existing?.count ?? 0);
    // The key's unique index decides between concurrent creations: no check-then-insert race.
    const [created] = await tx
      .insert(projects)
      .values({ id, key, name, description, color })
      .onConflictDoNothing({ target: projects.key })
      .returning({ id: projects.id });
    if (!created) {
      throw new HttpError(409, 'PROJECT_KEY_TAKEN', 'Another project has this key');
    }
    await tx.insert(projectMembers).values({ projectId: id, userId: actor.id });
    log.info({ projectId: id, key, by: actor.id }, 'Project created');
    return { id, key };
  },
});
