import { schema } from '@toppo/db';
import { mailSettingsRequestSchema } from '@toppo/shared';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { mailSettings } = schema;

/**
 * Saves how the instance sends email. The password is sealed with the instance's key; left out,
 * the one saved stays, for the same account on the same server only: never sent anywhere else.
 * Without a user name, the server takes mail without signing in.
 */
export const saveMailSettings = defineCommand({
  name: 'mail.saveSettings',
  access: { permission: 'instance.mail.manage' },
  input: mailSettingsRequestSchema,
  async handler({ tx, actor, services, log }, { username, password, ...settings }): Promise<void> {
    const signsIn = username !== undefined && username !== '';
    let passwordSealed: string | null = null;
    if (signsIn && password !== undefined) {
      passwordSealed = services.secrets.seal(password);
    } else if (signsIn) {
      const [saved] = await tx
        .select({
          host: mailSettings.host,
          port: mailSettings.port,
          security: mailSettings.security,
          username: mailSettings.username,
          passwordSealed: mailSettings.passwordSealed,
        })
        .from(mailSettings)
        .for('update');
      const sameAccount =
        saved?.host === settings.host &&
        saved.port === settings.port &&
        saved.security === settings.security &&
        saved.username === username;
      if (!(sameAccount && saved.passwordSealed)) {
        throw new HttpError(400, 'MAIL_PASSWORD_REQUIRED', 'Enter the password of this account');
      }
      passwordSealed = saved.passwordSealed;
    }
    const row = { ...settings, username: signsIn ? username : null, passwordSealed };
    await tx
      .insert(mailSettings)
      .values(row)
      .onConflictDoUpdate({ target: mailSettings.id, set: row });
    log.info(
      { host: settings.host, port: settings.port, security: settings.security, by: actor.id },
      'Mail settings saved',
    );
  },
});
