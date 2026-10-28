import { type CategoriesPlan, planCategories } from '@toppo-tracker/core';
import { isUniqueViolation, schema, uuidv7 } from '@toppo-tracker/db';
import { categoriesRequestSchema } from '@toppo-tracker/shared';
import { count, eq, inArray, sql } from 'drizzle-orm';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { issueCategories, issues } = schema;

/**
 * Saves the whole list of categories at once, as the settings edit it: renamed, recolored, in a
 * new order, added to, the default chosen, and deleted when left out, which only a category no
 * issue has can be. Issues keep theirs; their history keeps the names they had.
 */
export const saveCategories = defineCommand({
  name: 'category.saveAll',
  access: { permission: 'instance.settings.manage' },
  input: categoriesRequestSchema,
  async handler({ tx, actor, log }, { categories, removed }): Promise<void> {
    // Every category locked until the transaction ends: two saves apply one after the other, and
    // an issue given a category being deleted waits, then finds it gone.
    const stored = await tx.select({ id: issueCategories.id }).from(issueCategories).for('update');
    const plan = planCategories(
      stored.map(({ id }) => id),
      categories,
      removed,
    );
    if (!plan) {
      throw new HttpError(409, 'CATEGORIES_CHANGED', 'The categories changed meanwhile');
    }
    await removeUnused(tx, plan.removed);
    try {
      await keepAndAdd(tx, plan);
    } catch (error) {
      // The forms compare names in lower case as JavaScript does; PostgreSQL has the last word.
      if (isUniqueViolation(error, 'issue_categories_name_unique')) {
        throw new HttpError(409, 'CATEGORY_NAME_TAKEN', 'Two categories would share a name');
      }
      throw error;
    }
    log.info(
      { by: actor.id, added: plan.added.length, removed: plan.removed.length },
      'Categories saved',
    );
  },
});

async function removeUnused(tx: Transaction, removed: readonly string[]): Promise<void> {
  if (removed.length === 0) {
    return;
  }
  const [used] = await tx
    .select({ count: count() })
    .from(issues)
    .where(inArray(issues.categoryId, [...removed]));
  if ((used?.count ?? 0) > 0) {
    throw new HttpError(409, 'CATEGORY_IN_USE', 'Issues still have a category the list leaves out');
  }
  await tx.delete(issueCategories).where(inArray(issueCategories.id, [...removed]));
}

async function keepAndAdd(tx: Transaction, { kept, added }: CategoriesPlan): Promise<void> {
  // Names and the default are unique, checked row by row: the kept categories first give theirs
  // up, so that two of them can swap names, then take their new ones.
  await tx
    .update(issueCategories)
    .set({ name: sql`${issueCategories.id}::text`, isDefault: false })
    .where(
      inArray(
        issueCategories.id,
        kept.map(({ id }) => id),
      ),
    );
  for (const { id, ...fields } of kept) {
    await tx.update(issueCategories).set(fields).where(eq(issueCategories.id, id));
  }
  if (added.length > 0) {
    await tx.insert(issueCategories).values(added.map((fields) => ({ id: uuidv7(), ...fields })));
  }
}
