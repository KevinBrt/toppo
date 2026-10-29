import { type Db, schema } from '@toppo-tracker/db';
import type { WebhookSummary } from '@toppo-tracker/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { projects, webhookProjects, webhooks } = schema;

export const webhookNotFound = () =>
  new HttpError(404, 'WEBHOOK_NOT_FOUND', 'This webhook does not exist');

/** A webhook, locked until the transaction ends: two changes of it never cross. */
export async function lockWebhook(
  tx: Transaction,
  webhookId: string,
): Promise<typeof webhooks.$inferSelect> {
  const [webhook] = await tx
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, webhookId))
    .for('update');
  if (!webhook) {
    throw webhookNotFound();
  }
  return webhook;
}

/** The ids of the projects named, every one of which must exist. */
export async function projectIdsOf(tx: Transaction, keys: readonly string[]): Promise<string[]> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) {
    return [];
  }
  const found = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.key, unique));
  if (found.length !== unique.length) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', 'This project does not exist');
  }
  return found.map(({ id }) => id);
}

/** Webhooks as their page lists them, with the projects each is told of, by name. */
export async function webhookSummaries(
  db: Pick<Db, 'select'>,
  rows: readonly (typeof webhooks.$inferSelect)[],
): Promise<WebhookSummary[]> {
  const ids = rows.map(({ id }) => id);
  const chosen =
    ids.length === 0
      ? []
      : await db
          .select({
            webhookId: webhookProjects.webhookId,
            id: projects.id,
            key: projects.key,
            name: projects.name,
          })
          .from(webhookProjects)
          .innerJoin(projects, eq(projects.id, webhookProjects.projectId))
          .where(inArray(webhookProjects.webhookId, ids))
          .orderBy(asc(projects.key));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    events: row.events,
    allProjects: row.allProjects,
    projects: chosen
      .filter(({ webhookId }) => webhookId === row.id)
      .map(({ id, key, name }) => ({ id, key, name })),
    allowPrivate: row.allowPrivate,
    enabled: row.enabled,
    failures: row.failures,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  }));
}
