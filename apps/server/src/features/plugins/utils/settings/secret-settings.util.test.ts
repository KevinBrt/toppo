import { describe, expect, it } from 'vitest';
import { createSecretBox } from '../../../../platform/config/secret-box.ts';
import { testManifest } from '../../../../platform/plugins/packages/test-package.ts';
import { openSettings, settingsWithoutSecrets } from './secret-settings.util.ts';

const box = createSecretBox('a key for the tests, long enough to be accepted');

/** A plugin whose `token` is a secret, or no longer one. */
const manifestWith = (tokenIsSecret: boolean) =>
  testManifest({
    settings: {
      type: 'object',
      properties: {
        token: { type: 'string', ...(tokenIsSecret ? { writeOnly: true } : {}) },
        team: { type: 'string' },
      },
    },
  });

describe('a plugin’s settings as it reads them', () => {
  const stored = { token: { sealed: box.seal('xoxb-secret') }, team: 'Billing' };

  it('open the secrets its manifest declares', () => {
    expect(openSettings(stored, manifestWith(true), box)).toStrictEqual({
      token: 'xoxb-secret',
      team: 'Billing',
    });
  });

  it('leave out a value sealed under a name it no longer declares a secret', () => {
    expect(openSettings(stored, manifestWith(false), box)).toStrictEqual({ team: 'Billing' });
  });

  it('leave out every secret for code not approved yet', () => {
    expect(settingsWithoutSecrets(stored)).toStrictEqual({ team: 'Billing' });
  });
});
