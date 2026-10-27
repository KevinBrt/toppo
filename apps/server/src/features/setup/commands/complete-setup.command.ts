import {
  DEFAULT_CATEGORIES,
  DEFAULT_FIELD_NAMES,
  DEFAULT_PRIORITIES,
  DEFAULT_ROLE_IDS,
  DEFAULT_ROLE_NAMES,
  DEFAULT_ROLES,
  DEFAULT_STATUSES,
} from '@toppo/core';
import { schema, uuidv7 } from '@toppo/db';
import { type Locale, type SetupResponse, setupRequestSchema } from '@toppo/shared';
import { eq } from 'drizzle-orm';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { setupCodesMatch } from '../utils/setup-code.util.ts';

const {
  accounts,
  instanceSettings,
  INSTANCE_SETTINGS_ID,
  issueCategories,
  priorities,
  roles,
  statuses,
  users,
} = schema;

/** Better Auth's provider id for email and password credentials. */
const CREDENTIAL_PROVIDER = 'credential';

/**
 * Creates the first administrator, names the default roles, statuses, priorities and categories
 * in their language and closes the wizard, atomically. The instance settings row is locked meanwhile, so concurrent attempts are
 * serialized and only the first succeeds.
 */
export const completeSetup = defineCommand({
  name: 'setup.complete',
  // Public, but only with the one-time code printed in the server logs.
  access: 'public',
  input: setupRequestSchema,
  async handler({ tx, services, log }, input): Promise<SetupResponse> {
    if (!setupCodesMatch(services.setupCode, input.setupCode)) {
      throw new HttpError(403, 'INVALID_SETUP_CODE', 'The setup code is not valid');
    }
    // Slow on purpose (scrypt): done before taking the lock.
    const passwordHash = await services.hashPassword(input.admin.password);

    const [settings] = await tx
      .select({ setupCompletedAt: instanceSettings.setupCompletedAt })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ID))
      .for('update');
    if (settings?.setupCompletedAt !== null) {
      throw new HttpError(409, 'SETUP_ALREADY_COMPLETED', 'This instance is already set up');
    }

    const userId = uuidv7();
    await tx.insert(users).values({
      id: userId,
      name: input.admin.name,
      email: input.admin.email,
      // The administrator typed this address themselves; there is nobody to verify it with yet.
      emailVerified: true,
      instanceRoleId: DEFAULT_ROLE_IDS.administrator,
      // The language the wizard was used in: the interface speaks the account's from now on.
      locale: input.locale,
    });
    await tx.insert(accounts).values({
      accountId: userId,
      providerId: CREDENTIAL_PROVIDER,
      userId,
      password: passwordHash,
    });
    for (const role of DEFAULT_ROLES) {
      await tx
        .update(roles)
        .set({ name: DEFAULT_ROLE_NAMES[input.locale][role.kind] })
        .where(eq(roles.id, role.id));
    }
    await nameDefaultFields(tx, input.locale);
    await tx
      .update(instanceSettings)
      .set({ setupCompletedAt: new Date() })
      .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ID));

    log.info({ userId }, 'First administrator created');
    return { userId };
  },
});

/** The seeded statuses, priorities and categories, in the administrator's language. */
async function nameDefaultFields(tx: Transaction, locale: Locale): Promise<void> {
  const names = DEFAULT_FIELD_NAMES[locale];
  for (const status of DEFAULT_STATUSES) {
    await tx
      .update(statuses)
      .set({ name: names.statuses[status.kind] })
      .where(eq(statuses.id, status.id));
  }
  for (const priority of DEFAULT_PRIORITIES) {
    await tx
      .update(priorities)
      .set({ name: names.priorities[priority.kind] })
      .where(eq(priorities.id, priority.id));
  }
  for (const category of DEFAULT_CATEGORIES) {
    await tx
      .update(issueCategories)
      .set({ name: names.categories[category.kind] })
      .where(eq(issueCategories.id, category.id));
  }
}
