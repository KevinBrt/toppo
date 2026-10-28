import { schema, uuidv7 } from '@toppo-tracker/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { testManifest } from '../../../platform/plugins/packages/test-package.ts';
import { setupTestDatabase, testExecutionContext } from '../../../test-helpers.ts';
import { storePluginSettings } from './store-plugin-settings.command.ts';

const context = setupTestDatabase();
const CHECKED = 'a'.repeat(64);

describe('storing a plugin’s settings', () => {
  it('refuses settings checked by another package than the one installed now', async () => {
    const { db } = context.database;
    await db.insert(schema.plugins).values({
      slug: 'time-tracking',
      version: '1.3.0',
      manifest: testManifest(),
      // Uploaded while the settings were being checked by the previous version.
      packageSha256: 'b'.repeat(64),
    });
    const execution = testExecutionContext(context.database, {
      id: uuidv7(),
      permissions: ['instance.plugins.manage'],
    });

    await expect(
      storePluginSettings.execute(execution, {
        pluginSlug: 'time-tracking',
        sha256: CHECKED,
        values: { hoursPerDay: 8 },
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'PLUGIN_CHANGED' });
    const [kept] = await db
      .select({ settings: schema.plugins.settings })
      .from(schema.plugins)
      .where(eq(schema.plugins.slug, 'time-tracking'));
    expect(kept?.settings).toStrictEqual({});
  });
});
