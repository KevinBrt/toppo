import { schema } from '@toppo-tracker/db';
import { PLUGINS_MAX, type PluginsResponse } from '@toppo-tracker/shared';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { plugins } = schema;

/** Every plugin installed, by slug: a short list, `PLUGINS_MAX` at most. */
export const listPlugins = defineQuery({
  name: 'plugin.list',
  access: { permission: 'instance.plugins.manage' },
  input: z.object({}),
  async handler({ db }): Promise<PluginsResponse> {
    const rows = await db
      .select({
        slug: plugins.slug,
        version: plugins.version,
        state: plugins.state,
        createdAt: plugins.createdAt,
        updatedAt: plugins.updatedAt,
      })
      .from(plugins)
      .orderBy(asc(plugins.slug))
      .limit(PLUGINS_MAX);
    return {
      plugins: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  },
});
