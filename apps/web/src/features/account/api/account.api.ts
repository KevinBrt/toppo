import type { ChangePasswordRequest, Locale, UpdateAccountRequest } from '@toppo/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Each answers `204 No Content`. */
const noContent = z.null();

/** Server calls about one's own account. */
export const Account = {
  async update(account: UpdateAccountRequest): Promise<void> {
    await apiRequest('/api/v1/me', { method: 'PATCH', body: account, schema: noContent });
  },

  /** Remembers the language the interface speaks, which emails then speak too. */
  async setLocale(locale: Locale): Promise<void> {
    await apiRequest('/api/v1/me/locale', { method: 'PUT', body: { locale }, schema: noContent });
  },

  /** Signs out every other device; this one carries on in a new session. */
  async changePassword(passwords: ChangePasswordRequest): Promise<void> {
    await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: passwords,
      schema: noContent,
    });
  },
};
