import {
  type CurrentUser,
  emailSchema,
  type Locale,
  type SetupRequest,
} from '@toppo-tracker/shared';
import { z } from 'zod';

export interface SessionState {
  setupRequired: boolean;
  user: CurrentUser | null;
}

export const loginFormSchema = z.object({
  email: emailSchema,
  // Length rules apply when choosing a password, not when typing an existing one.
  password: z.string().min(1),
});

export type LoginFormValues = z.input<typeof loginFormSchema>;

export const EMPTY_LOGIN_FORM: LoginFormValues = { email: '', password: '' };

/** The setup wizard's fields, flat as they appear on screen. */
export interface SetupFormValues {
  setupCode: string;
  name: string;
  email: string;
  password: string;
}

export const EMPTY_SETUP_FORM: SetupFormValues = {
  setupCode: '',
  name: '',
  email: '',
  password: '',
};

export function toSetupRequest(
  { setupCode, name, email, password }: SetupFormValues,
  locale: Locale,
): SetupRequest {
  return { setupCode, admin: { name, email, password }, locale };
}
