import { priorityLevelOf } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { PRIORITY_LEVELS, type PrioritiesResponse } from '@toppo-tracker/shared';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { priorities } = schema;

/** The four levels, lowest first, with their names and which one new issues get. */
export const listPriorities = defineQuery({
  name: 'priority.list',
  access: { permission: 'instance.settings.manage' },
  input: z.object({}),
  async handler({ db }): Promise<PrioritiesResponse> {
    const rows = await db
      .select({
        id: priorities.id,
        name: priorities.name,
        level: priorities.level,
        isDefault: priorities.isDefault,
      })
      .from(priorities)
      .orderBy(priorities.level)
      .limit(PRIORITY_LEVELS.length);

    return {
      priorities: rows.map((priority) => ({ ...priority, level: priorityLevelOf(priority.level) })),
    };
  },
});
