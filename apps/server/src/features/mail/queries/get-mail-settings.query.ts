import { schema } from '@toppo-tracker/db';
import type { MailSettingsResponse } from '@toppo-tracker/shared';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { mailSettings } = schema;

/** How the instance sends email, without its password: only whether one is saved. */
export const getMailSettings = defineQuery({
  name: 'mail.getSettings',
  access: { permission: 'instance.mail.manage' },
  input: z.object({}),
  async handler({ db }): Promise<MailSettingsResponse> {
    const [row] = await db
      .select({
        host: mailSettings.host,
        port: mailSettings.port,
        security: mailSettings.security,
        username: mailSettings.username,
        passwordSealed: mailSettings.passwordSealed,
        fromAddress: mailSettings.fromAddress,
        fromName: mailSettings.fromName,
      })
      .from(mailSettings);
    if (!row) {
      return { settings: null };
    }
    const { passwordSealed, ...settings } = row;
    return { settings: { ...settings, passwordSet: passwordSealed !== null } };
  },
});
