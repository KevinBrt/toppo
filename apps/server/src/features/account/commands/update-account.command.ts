import { schema } from '@toppo-tracker/db';
import { updateAccountRequestSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';

const { users } = schema;

/** Changes one's own name, as others see it. The address stays: it is how one signs in. */
export const updateAccount = defineCommand({
  name: 'account.update',
  access: 'authenticated',
  input: updateAccountRequestSchema,
  async handler({ tx, actor, log }, { name }): Promise<void> {
    await tx.update(users).set({ name }).where(eq(users.id, actor.id));
    log.info({ userId: actor.id }, 'Account updated');
  },
});
