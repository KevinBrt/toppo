import { asksForMore } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { type Manifest, manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { PLUGINS_MAX } from '@toppo-tracker/shared';
import { count, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import {
  openPluginPackage,
  type PluginPackage,
} from '../../../platform/plugins/packages/open-package.ts';
import { declaredLogo, declaredManifest } from '../utils/declared-manifest.util.ts';
import { forgetPluginPermissions } from '../utils/plugin-permissions.util.ts';

const { plugins } = schema;

/** Arbitrary but fixed: one plugin installed at a time, whoever uploads it. */
export const PLUGIN_INSTALL_LOCK_KEY = 7_461_756_327;

/**
 * Installs a plugin from its zip, or upgrades the one of the same id. Nothing of it runs but what
 * it declares, read in a sandbox of its own: a new plugin waits for an administrator's approval.
 * An upgrade takes the place of the approved version, unless it asks for more: then it waits for
 * a new approval, and runs no more meanwhile. The permissions it no longer declares leave every
 * role.
 */
export const installPlugin = defineCommand({
  name: 'plugin.install',
  access: { permission: 'instance.plugins.manage' },
  input: z.object({ zip: z.custom<Uint8Array>((value) => value instanceof Uint8Array) }),
  async handler({ tx, actor, services, log }, { zip }): Promise<{ slug: string }> {
    // Each install holds a connection while the sandbox reads the bundle: never several at once.
    const [lock] = await tx.execute<{ taken: boolean }>(
      sql`select pg_try_advisory_xact_lock(${PLUGIN_INSTALL_LOCK_KEY}) as taken`,
    );
    if (!lock?.taken) {
      throw new HttpError(409, 'PLUGIN_INSTALL_RUNNING', 'Another plugin is being installed');
    }
    const opened = openPluginPackage(zip);
    const manifest = declaredManifest(await services.plugins.readManifest(opened.code, log), log);
    const logo = declaredLogo(manifest, opened);
    const [installed] = await tx
      .select({
        id: plugins.id,
        version: plugins.version,
        manifest: plugins.manifest,
        approvedAt: plugins.approvedAt,
      })
      .from(plugins)
      .where(eq(plugins.slug, manifest.id))
      .for('update');
    if (!installed) {
      await assertRoomForOneMore(tx);
    }
    await services.plugins.packages.keep({ slug: manifest.id, sha256: opened.sha256 }, zip);
    const plugin = {
      slug: manifest.id,
      version: opened.version,
      sha256: opened.sha256,
      by: actor.id,
    };

    if (!installed) {
      await tx.insert(plugins).values(rowOf(manifest, opened, logo));
      log.info(plugin, 'Plugin installed, waiting for approval');
      return { slug: manifest.id };
    }
    const approved = manifestSchema.safeParse(installed.manifest);
    // An approval covers what was approved: an approved plugin that asks for more is asked again.
    const waitsForApproval =
      installed.approvedAt !== null && (!approved.success || asksForMore(approved.data, manifest));
    await tx
      .update(plugins)
      .set({
        ...rowOf(manifest, opened, logo),
        ...(waitsForApproval ? { state: 'pending', approvedAt: null, approvedById: null } : {}),
      })
      .where(eq(plugins.id, installed.id));
    await forgetPluginPermissions(
      tx,
      manifest.id,
      Object.keys(manifest.permissions).map((name) => `${manifest.id}.${name}`),
    );
    log.info({ ...plugin, from: installed.version, waitsForApproval }, 'Plugin upgraded');
    return { slug: manifest.id };
  },
});

async function assertRoomForOneMore(tx: Transaction): Promise<void> {
  const [installed] = await tx.select({ count: count() }).from(plugins);
  if ((installed?.count ?? 0) >= PLUGINS_MAX) {
    throw new HttpError(
      409,
      'PLUGIN_LIMIT_REACHED',
      `An instance runs at most ${PLUGINS_MAX} plugins: remove one first`,
    );
  }
}

function rowOf(manifest: Manifest, opened: PluginPackage, logo: ReturnType<typeof declaredLogo>) {
  return {
    slug: manifest.id,
    version: opened.version,
    manifest,
    packageSha256: opened.sha256,
    ...logo,
  };
}
