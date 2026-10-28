import { schema } from '@toppo-tracker/db';
import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { plugins } = schema;

export function pluginNotFound(): HttpError {
  return new HttpError(404, 'PLUGIN_NOT_FOUND', 'No plugin is installed by this name');
}

/** A plugin, locked until the transaction ends: its changes never cross. */
export async function lockPlugin(
  tx: Transaction,
  slug: string,
): Promise<{ id: string; version: string; approvedAt: Date | null }> {
  const [plugin] = await tx
    .select({ id: plugins.id, version: plugins.version, approvedAt: plugins.approvedAt })
    .from(plugins)
    .where(eq(plugins.slug, slug))
    .for('update');
  if (!plugin) {
    throw pluginNotFound();
  }
  return plugin;
}
