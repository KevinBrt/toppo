import {
  type CurrentUser,
  meResponseSchema,
  passwordResetAvailabilityResponseSchema,
  type ResetPasswordRequest,
  type SetupRequest,
  setupResponseSchema,
  setupStatusResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Server calls about the first-run setup and who is signed in. */
export const Session = {
  /** Whether the first-run wizard still has to run. */
  async isSetupRequired(): Promise<boolean> {
    return (await apiRequest('/api/v1/setup', { schema: setupStatusResponseSchema })).required;
  },

  /** Creates the instance's first administrator. */
  async completeSetup(request: SetupRequest): Promise<void> {
    await apiRequest('/api/v1/setup', {
      method: 'POST',
      body: request,
      schema: setupResponseSchema,
    });
  },

  /** The signed-in user, or `null` when nobody is. */
  async currentUser(): Promise<CurrentUser | null> {
    return (await apiRequest('/api/v1/me', { schema: meResponseSchema })).user;
  },

  async signIn(email: string, password: string): Promise<void> {
    await apiRequest('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email, password },
      schema: z.unknown(),
    });
  },

  /** Whether a forgotten password can be reset by email: only once email is set up. */
  async isPasswordResetAvailable(): Promise<boolean> {
    return (
      await apiRequest('/api/auth/password-reset', {
        schema: passwordResetAvailabilityResponseSchema,
      })
    ).available;
  },

  /** Asks for a link to choose a new password; answered the same whether the address has an account. */
  async requestPasswordReset(email: string): Promise<void> {
    await apiRequest('/api/auth/request-password-reset', {
      method: 'POST',
      body: { email },
      schema: z.null(),
    });
  },

  /** Sets a new password with the token of the link emailed; every device is signed out. */
  async resetPassword(request: ResetPasswordRequest): Promise<void> {
    await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: request,
      schema: z.null(),
    });
  },

  async signOut(): Promise<void> {
    await apiRequest('/api/auth/sign-out', { method: 'POST', body: {}, schema: z.unknown() });
  },
};
