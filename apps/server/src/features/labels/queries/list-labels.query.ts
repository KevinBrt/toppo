import { schema } from '@toppo-tracker/db';
import { LABELS_MAX, type LabelsResponse } from '@toppo-tracker/shared';
import { asc, count, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { issueLabels, labels } = schema;

/** Every label by name, with how many issues have it: what deleting it takes off. */
export const listLabels = defineQuery({
  name: 'label.list',
  access: { permission: 'instance.settings.manage' },
  input: z.object({}),
  async handler({ db }): Promise<LabelsResponse> {
    const rows = await db
      .select({
        id: labels.id,
        name: labels.name,
        color: labels.color,
        issueCount: count(issueLabels.id),
      })
      .from(labels)
      .leftJoin(issueLabels, eq(issueLabels.labelId, labels.id))
      .groupBy(labels.id)
      .orderBy(sql`lower(${labels.name})`, asc(labels.id))
      .limit(LABELS_MAX);
    return { labels: rows };
  },
});
