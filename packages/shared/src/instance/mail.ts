import { z } from 'zod';
import { displayNameSchema, emailSchema } from '../auth.ts';

/**
 * How the connection to the mail server is secured: STARTTLS on a plain connection (port 587),
 * TLS from the start (465), or nothing, for a relay on the same machine or network.
 */
export const MAIL_SECURITY = ['starttls', 'tls', 'none'] as const;

export type MailSecurity = (typeof MAIL_SECURITY)[number];

/** The usual port of each kind of connection, offered when it is chosen. */
export const MAIL_DEFAULT_PORTS: Readonly<Record<MailSecurity, number>> = {
  starttls: 587,
  tls: 465,
  none: 25,
};

/** A host name or an IP address, nothing a header or a URL could carry along. */
const hostSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^[\w.:-]+$/u);

/**
 * Body of `PUT /api/v1/settings/email`. Without a user name, the server takes mail without
 * signing in; with one, a password left out keeps the one saved.
 */
export const mailSettingsRequestSchema = z.object({
  host: hostSchema,
  port: z.number().int().min(1).max(65_535),
  security: z.enum(MAIL_SECURITY),
  username: z.string().trim().max(320).optional(),
  password: z.string().min(1).max(1000).optional(),
  fromAddress: emailSchema,
  fromName: displayNameSchema,
});

export type MailSettingsRequest = z.input<typeof mailSettingsRequestSchema>;

/** The mail settings as the administrator reads them: never the password, only whether one is saved. */
export const mailSettingsSchema = z.object({
  host: z.string(),
  port: z.number().int(),
  security: z.enum(MAIL_SECURITY),
  username: z.string().nullable(),
  passwordSet: z.boolean(),
  fromAddress: z.string(),
  fromName: z.string(),
});

export type MailSettings = z.infer<typeof mailSettingsSchema>;

/** Body of `GET /api/v1/settings/email`: `null` while email is not set up. */
export const mailSettingsResponseSchema = z.object({ settings: mailSettingsSchema.nullable() });

export type MailSettingsResponse = z.infer<typeof mailSettingsResponseSchema>;
