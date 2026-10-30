import { type Db, schema } from '@toppo-tracker/db';
import { issueSnapshotSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { eq } from 'drizzle-orm';
import { issueEventOf } from '../../../platform/activities/issue-events.ts';

const { issueCategories, issues, priorities, projects, statuses } = schema;

/**
 * What a webhook is sent, as Standard Webhooks writes it: the event's type, when it happened, and
 * its data, the plugins' format (the event, the issue as it stands, what changed) with the issue's
 * description, which a plugin reads only with its need.
 */
export interface WebhookPayload extends Record<string, unknown> {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/** The issue as it stands, its words included, or `null` once it is gone. */
async function issueAsItStands(db: Db, issueId: string) {
  const [row] = await db
    .select({
      id: issues.id,
      number: issues.number,
      projectId: projects.id,
      projectKey: projects.key,
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
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .innerJoin(statuses, eq(statuses.id, issues.statusId))
    .innerJoin(issueCategories, eq(issueCategories.id, issues.categoryId))
    .innerJoin(priorities, eq(priorities.id, issues.priorityId))
    .where(eq(issues.id, issueId));
  if (!row) {
    return null;
  }
  const { number, description, closedAt, createdAt, updatedAt, ...snapshot } = row;
  return {
    description,
    snapshot: issueSnapshotSchema.parse({
      ...snapshot,
      key: `${row.projectKey}-${number}`,
      closedAt: closedAt?.toISOString() ?? null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    }),
  };
}

/** What webhooks are sent of activity `activityId`, or `null` when there is nothing to tell. */
export async function webhookPayloadOf(db: Db, activityId: string): Promise<WebhookPayload | null> {
  let description: string | undefined;
  const event = await issueEventOf(db, activityId, async ({ issueId }) => {
    const issue = await issueAsItStands(db, issueId);
    description = issue?.description;
    return issue?.snapshot ?? null;
  });
  if (!event) {
    return null;
  }
  const { event: about, issue, change } = event.payload;
  return {
    type: event.type,
    timestamp: about.occurredAt,
    data: {
      event: about,
      issue: description === undefined ? issue : { ...issue, description },
      change,
    },
  };
}
