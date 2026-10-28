import {
  type MailSettings,
  type MailSettingsRequest,
  mailSettingsResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Commands answer `204 No Content`. */
const noContent = z.null();

const SETTINGS_PATH = '/api/v1/settings/email';

/** Server calls about how the instance sends email. */
export const Mail = {
  /** The settings without their password, or `null` while email is not set up. */
  async settings(): Promise<MailSettings | null> {
    return (await apiRequest(SETTINGS_PATH, { schema: mailSettingsResponseSchema })).settings;
  },

  async save(settings: MailSettingsRequest): Promise<void> {
    await apiRequest(SETTINGS_PATH, { method: 'PUT', body: settings, schema: noContent });
  },

  /** Deletes the settings and their password: nothing is emailed any more. */
  async turnOff(): Promise<void> {
    await apiRequest(SETTINGS_PATH, { method: 'DELETE', schema: noContent });
  },

  /** Sends a test email to oneself with the settings saved; refused with the reason why. */
  async sendTest(): Promise<void> {
    await apiRequest(`${SETTINGS_PATH}/test`, { method: 'POST', schema: noContent });
  },
};
