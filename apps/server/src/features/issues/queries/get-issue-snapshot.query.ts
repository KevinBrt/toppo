import { type Db, schema } from '@toppo-tracker/db';
import type { IssueDetails } from '@toppo-tracker/plugin-sdk/protocol';
import { issueKeyParamsSchema } from '@toppo-tracker/shared';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../../platform/auth/actor.ts';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { propertiesOf } from '../../../platform/plugins/plugin-properties.ts';

const { issueCategories, issues, priorities, properties, statuses } = schema;

/**
 * The values of a plugin's own properties shown in the project, by the names it gives them:
 * another's are not its to read.
 */
async function ownPropertyValues(
  db: Pick<Db, 'select'>,
  actor: Actor,
  projectId: string,
  values: Readonly<Record<string, unknown>>,
): Promise<Record<string, number | string | boolean>> {
  if (!actor.plugin) {
    return {};
  }
  const own = await db
    .select({ id: properties.id, name: properties.pluginProperty })
    .from(properties)
    .where(and(eq(properties.pluginSlug, actor.plugin.slug), propertiesOf(projectId)));
  return Object.fromEntries(
    own.flatMap(({ id, name }) => {
      const value = values[id];
      return name !== null &&
        (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')
        ? [[name, value]]
        : [];
    }),
  );
}

/**
 * An issue as a plugin sees it (`ctx.issues.get`, the issue of an event): what it is and where it
 * stands, with its words and the plugin's own properties, by ids rather than as people read it.
 */
export const getIssueSnapshot = defineQuery({
  name: 'issue.snapshot',
  access: { project: 'issueKey', permission: 'issue.read' },
  input: issueKeyParamsSchema,
  async handler({ db, actor, project }): Promise<IssueDetails> {
    const [row] = await db
      .select({
        title: issues.title,
        description: issues.description,
        status: { id: statuses.id, name: statuses.name, closes: statuses.closes },
        category: { id: issueCategories.id, name: issueCategories.name },
        priority: { id: priorities.id, name: priorities.name, level: priorities.level },
        assigneeId: issues.assigneeId,
        reporterId: issues.reporterId,
        closedAt: issues.closedAt,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        properties: issues.properties,
      })
      .from(issues)
      .innerJoin(statuses, eq(statuses.id, issues.statusId))
      .innerJoin(issueCategories, eq(issueCategories.id, issues.categoryId))
      .innerJoin(priorities, eq(priorities.id, issues.priorityId))
      .where(eq(issues.id, project.issue.id));
    if (!row) {
      throw new Error('The issue resolved was not found');
    }
    const { level } = row.priority;
    if (!(level === 1 || level === 2 || level === 3 || level === 4)) {
      throw new Error(`A priority has the level ${level}, out of 1 to 4`);
    }
    return {
      ...row,
      properties: await ownPropertyValues(db, actor, project.id, row.properties),
      id: project.issue.id,
      key: project.issue.key,
      projectId: project.id,
      projectKey: project.key,
      priority: { ...row.priority, level },
      closedAt: row.closedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  },
});
