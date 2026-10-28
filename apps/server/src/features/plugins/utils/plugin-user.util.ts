import { pluginUserOf } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { users } = schema;

/**
 * The plugin's own user, through which it writes: made at its first approval, found again when
 * it is approved anew or comes back once uninstalled, so that what it wrote keeps its author. It
 * holds no role and never signs in: what it may do comes from its approval alone.
 */
export async function ensurePluginUser(tx: Transaction, slug: string): Promise<void> {
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.pluginSlug, slug));
  if (existing) {
    return;
  }
  const user = pluginUserOf(slug);
  const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, user.email));
  if (taken) {
    throw new HttpError(
      409,
      'PLUGIN_USER_EMAIL_TAKEN',
      `${user.email} belongs to an account already: the plugin cannot have it as its own`,
    );
  }
  await tx.insert(users).values({ ...user, pluginSlug: slug });
}
