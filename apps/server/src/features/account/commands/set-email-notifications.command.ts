import { schema } from '@toppo/db';
import { emailNotificationsRequestSchema, NOTIFICATION_EVENTS } from '@toppo/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';

const { users } = schema;

/**
 * Chooses which kinds of one's notifications are emailed too; they all keep arriving in Toppo.
 * The kinds left out are stored, so that a kind to come is emailed until turned off.
 */
export const setEmailNotifications = defineCommand({
  name: 'account.setEmailNotifications',
  access: 'authenticated',
  input: emailNotificationsRequestSchema,
  async handler({ tx, actor, log }, { emailed }): Promise<void> {
    const muted = NOTIFICATION_EVENTS.filter((event) => !emailed.includes(event));
    await tx.update(users).set({ emailMutedEvents: muted }).where(eq(users.id, actor.id));
    log.info({ userId: actor.id, muted }, 'Notification emails changed');
  },
});
