import { z } from 'zod';
import { localeSchema } from './locale.ts';
import { NOTIFICATION_EVENTS } from './notifications.ts';

/** Long passphrases beat complex short passwords; no composition rules (NIST SP 800-63B). */
export const PASSWORD_MIN_LENGTH = 12;
/** Bounds hashing cost and blocks oversized payloads. */
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Where plugins' own users have their address: a domain that reaches no one (RFC 2606). */
export const PLUGIN_EMAIL_DOMAIN = 'plugins.invalid';

/** A person's address: never one of a plugin's user, which it would keep from being approved. */
export const personEmailSchema = emailSchema.refine(
  (email) => !email.endsWith(`@${PLUGIN_EMAIL_DOMAIN}`),
  'This address is kept for plugins',
);

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const displayNameSchema = z.string().trim().min(1).max(100);

export const currentUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  /** The language of the interface they last used, which emails to them speak. */
  locale: localeSchema,
  /** The kinds of their notifications emailed too, in catalog order. */
  emailedEvents: z.array(z.enum(NOTIFICATION_EVENTS)),
  /**
   * Instance permissions, by catalog name (`@toppo-tracker/core`), so the web app can hide what the user
   * cannot do. Plain strings on the wire: the server stays the only judge.
   */
  permissions: z.array(z.string()),
  /** Whether they manage the settings or the access of at least one project. */
  managesProjects: z.boolean(),
});

export type CurrentUser = z.infer<typeof currentUserSchema>;

/** Body of `GET /api/v1/me`: `user` is `null` when nobody is signed in. */
export const meResponseSchema = z.object({
  user: currentUserSchema.nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

/** Body of `PATCH /api/v1/me`: what one changes of one's own account. */
export const updateAccountRequestSchema = z.object({
  name: displayNameSchema,
});

export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;

/** How long a link to choose a new password works, in minutes. */
export const PASSWORD_RESET_LIFETIME_MINUTES = 60;

/** Body of `GET /api/auth/password-reset`: whether a forgotten password can be reset by email. */
export const passwordResetAvailabilityResponseSchema = z.object({ available: z.boolean() });

/** Body of `POST /api/auth/request-password-reset`. */
export const passwordResetRequestSchema = z.object({ email: emailSchema });

/** Body of `POST /api/auth/reset-password`: the token of the link emailed, and the new password. */
export const resetPasswordRequestSchema = z.object({
  token: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[\w-]+$/u),
  newPassword: passwordSchema,
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/** Body of `PUT /api/v1/me/email-notifications`: the kinds of one's notifications emailed too. */
export const emailNotificationsRequestSchema = z.object({
  emailed: z
    .array(z.enum(NOTIFICATION_EVENTS))
    .max(NOTIFICATION_EVENTS.length)
    .refine((events) => new Set(events).size === events.length, {
      message: 'Each kind at most once',
    }),
});

export type EmailNotificationsRequest = z.infer<typeof emailNotificationsRequestSchema>;

/** Body of `PUT /api/v1/me/locale`: the language the interface now speaks to them. */
export const accountLocaleRequestSchema = z.object({ locale: localeSchema });

/** Body of `POST /api/auth/change-password`. Every other device is signed out, always. */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
