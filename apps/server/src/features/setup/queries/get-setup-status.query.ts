import { schema } from '@toppo-tracker/db';
import type { SetupStatusResponse } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { instanceSettings, INSTANCE_SETTINGS_ID } = schema;

/** Whether the first-run wizard still has to run. */
export const getSetupStatus = defineQuery({
  name: 'setup.status',
  access: 'public',
  input: z.object({}),
  async handler({ db }): Promise<SetupStatusResponse> {
    const [settings] = await db
      .select({ setupCompletedAt: instanceSettings.setupCompletedAt })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ID));
    if (!settings) {
      throw new Error('instance_settings row is missing: migrations did not run');
    }
    return { required: settings.setupCompletedAt === null };
  },
});
