import { schema } from '@toppo-tracker/db';
import { accountLocaleRequestSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';

const { users } = schema;

/**
 * Remembers the language the interface speaks to someone, which follows their browser: what
 * reaches them outside it, email, speaks it too.
 */
export const setAccountLocale = defineCommand({
  name: 'account.setLocale',
  access: 'authenticated',
  input: accountLocaleRequestSchema,
  async handler({ tx, actor }, { locale }): Promise<void> {
    await tx.update(users).set({ locale }).where(eq(users.id, actor.id));
  },
});
