import { schema } from '@toppo/db';
import { z } from 'zod';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';

const { mailSettings } = schema;

/** Turns email off: the settings go, the password with them. Nothing is sent until set up again. */
export const removeMailSettings = defineCommand({
  name: 'mail.removeSettings',
  access: { permission: 'instance.mail.manage' },
  input: z.object({}),
  async handler({ tx, actor, log }): Promise<void> {
    await tx.delete(mailSettings);
    log.info({ by: actor.id }, 'Mail settings removed');
  },
});
