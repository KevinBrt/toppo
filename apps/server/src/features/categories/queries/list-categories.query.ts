import { schema } from '@toppo-tracker/db';
import { CATEGORIES_MAX, type CategoriesResponse } from '@toppo-tracker/shared';
import { count } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { issueCategories, issues } = schema;

/** Every category in its order, with how many issues have it: what keeps it from being deleted. */
export const listCategories = defineQuery({
  name: 'category.list',
  access: { permission: 'instance.settings.manage' },
  input: z.object({}),
  async handler({ db }): Promise<CategoriesResponse> {
    const rows = await db
      .select({
        id: issueCategories.id,
        name: issueCategories.name,
        color: issueCategories.color,
        isDefault: issueCategories.isDefault,
      })
      .from(issueCategories)
      .orderBy(issueCategories.position, issueCategories.id)
      .limit(CATEGORIES_MAX);
    const used = await db
      .select({ categoryId: issues.categoryId, count: count() })
      .from(issues)
      .groupBy(issues.categoryId);

    return {
      categories: rows.map((category) => ({
        ...category,
        issueCount: used.find((row) => row.categoryId === category.id)?.count ?? 0,
      })),
    };
  },
});
