import { can, isNewerVersion } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { type InstanceVersionResponse, TOPPO_VERSION } from '@toppo-tracker/shared';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { instanceSettings } = schema;

/**
 * The version running, and for whoever manages the instance, a newer one published as the daily
 * check last found it, with the page of its release notes.
 */
export const getVersion = defineQuery({
  name: 'instance.version',
  access: 'authenticated',
  input: z.object({}),
  async handler({ db, actor }): Promise<InstanceVersionResponse> {
    const [latest] = can(actor.permissions, 'instance.settings.manage')
      ? await db
          .select({
            version: instanceSettings.latestVersion,
            url: instanceSettings.latestVersionUrl,
          })
          .from(instanceSettings)
      : [];
    return {
      version: TOPPO_VERSION,
      update:
        latest?.version && latest.url && isNewerVersion(latest.version, TOPPO_VERSION)
          ? { version: latest.version, url: latest.url }
          : null,
    };
  },
});
