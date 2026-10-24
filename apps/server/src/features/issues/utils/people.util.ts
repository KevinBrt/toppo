import { schema } from '@toppo/db';
import { and, eq, isNull } from 'drizzle-orm';
import { reachableBy } from '../../../platform/auth/project-access.ts';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';

const { projects, users } = schema;

/**
 * Whether someone is an active member who reaches the project: who may be given its issues, or
 * named by a person property of them.
 */
export async function reachesProject(
  tx: Transaction,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const [reaching] = await tx
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(users, eq(users.id, userId))
    .where(
      and(
        eq(projects.id, projectId),
        isNull(users.deletedAt),
        isNull(users.deactivatedAt),
        reachableBy(userId),
      ),
    );
  return reaching !== undefined;
}
