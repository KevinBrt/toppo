import { schema } from '@toppo-tracker/db';
import { sql } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';

const { roles } = schema;

/**
 * Takes the permissions of plugin `slug` out of every role, but those named in `kept`: all of
 * them when it is uninstalled, those its new version no longer declares when it is upgraded. Gone
 * for good, they would otherwise come back with the plugin, to roles nobody looked at again.
 */
export async function forgetPluginPermissions(
  tx: Transaction,
  slug: string,
  kept: readonly string[],
): Promise<void> {
  const keptArray = sql`array[${sql.join(
    kept.map((name) => sql`${name}`),
    sql`, `,
  )}]::text[]`;
  const forgotten = sql`starts_with(permission, ${`${slug}.`}) and not (permission = any(${keptArray}))`;
  await tx
    .update(roles)
    .set({
      permissions: sql`array(select permission from unnest(${roles.permissions}) as permission where not (${forgotten}))`,
    })
    .where(
      sql`exists (select 1 from unnest(${roles.permissions}) as permission where ${forgotten})`,
    );
}
