import { schema } from '@toppo-tracker/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Transaction } from '../cqrs/cqrs.ts';

const { pluginOnceKeys } = schema;

/** A write a plugin asked to make once, under a key of its choosing (`{ once: event.id }`). */
export interface OnceKey {
  pluginSlug: string;
  /** The call that writes: `issues.comment`. */
  method: string;
  key: string;
}

/**
 * Makes `write` at most once for its key: a second time, it answers what the first did. Both the
 * write and its key commit in `tx`, or neither does; two at once meet on the key's unique index,
 * and the later one fails.
 */
export async function writeOnce<Result extends Record<string, unknown>>(
  tx: Transaction,
  { pluginSlug, method, key }: OnceKey,
  result: z.ZodType<Result>,
  write: () => Promise<Result>,
): Promise<Result> {
  const [done] = await tx
    .select({ result: pluginOnceKeys.result })
    .from(pluginOnceKeys)
    .where(
      and(
        eq(pluginOnceKeys.pluginSlug, pluginSlug),
        eq(pluginOnceKeys.method, method),
        eq(pluginOnceKeys.key, key),
      ),
    );
  if (done) {
    return result.parse(done.result);
  }
  const written = await write();
  await tx.insert(pluginOnceKeys).values({ pluginSlug, method, key, result: written });
  return written;
}
