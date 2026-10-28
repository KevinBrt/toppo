import { type Db, schema, uuidv7 } from '@toppo-tracker/db';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_LIFETIME_MINUTES,
} from '@toppo-tracker/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { createSecretBox } from '../config/secret-box.ts';
import { enqueue } from '../jobs/jobs.ts';
import { passwordResetMailJob } from './password-reset-mail.ts';

export const AUTH_BASE_PATH = '/api/auth';

/**
 * Better Auth trusts `X-Forwarded-For` by default, which any client can forge to dodge rate
 * limits. The server overwrites this header with the address Fastify resolved (which honors
 * `TOPPO_TRUST_PROXY`) and Better Auth reads only this one.
 */
export const CLIENT_IP_HEADER = 'x-toppo-client-ip';

const DAY_SECONDS = 24 * 60 * 60;

export interface AuthOptions {
  db: Db;
  secret: string;
  publicUrl: URL;
}

export function createAuth({ db, secret, publicUrl }: AuthOptions) {
  const secrets = createSecretBox(secret);
  return betterAuth({
    appName: 'Toppo',
    baseURL: publicUrl.origin,
    basePath: AUTH_BASE_PATH,
    secret,
    trustedOrigins: [publicUrl.origin],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        rateLimit: schema.rateLimits,
      },
    }),
    user: {
      additionalFields: {
        // Declared so Better Auth accepts this column, set on every live account. Better Auth
        // never takes it from a client nor sends it back; Toppo sets it when it creates an
        // account (setup, invitation).
        instanceRoleId: { type: 'string', required: true, input: false, returned: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Accounts are created by the first-run wizard and, later, by administrators.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_LIFETIME_MINUTES * 60,
      // Whoever had the old password, on whatever device, is out once it changes.
      revokeSessionsOnPasswordReset: true,
      // Never in the request: the link leaves from the job queue, its token sealed.
      async sendResetPassword({ user, token }) {
        await enqueue(db, passwordResetMailJob, {
          userId: user.id,
          sealedToken: secrets.seal(token),
        });
      },
    },
    // Reset tokens are kept as hashes: a copy of the database gives none that works.
    verification: { storeIdentifier: 'hashed' },
    session: {
      expiresIn: 30 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
    },
    databaseHooks: {
      session: {
        create: {
          // Runs once the password is verified: only the account's owner learns it is deactivated.
          async before(session) {
            const refusal = await signInRefusal(db, session.userId);
            if (refusal) {
              throw APIError.from('FORBIDDEN', refusal);
            }
          },
        },
      },
    },
    rateLimit: {
      // Off by default outside production: always on here, tests included.
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: 'toppo',
      // Explicit: Better Auth would otherwise force Secure cookies in production, breaking
      // plain-HTTP installs on a LAN.
      useSecureCookies: publicUrl.protocol === 'https:',
      database: { generateId: () => uuidv7() },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Why an account may not sign in, if it may not: deactivated, or a plugin's own user, which has
 * no password to begin with and writes through its plugin only.
 */
async function signInRefusal(
  db: Db,
  userId: string,
): Promise<{ code: string; message: string } | null> {
  const [user] = await db
    .select({ deactivatedAt: schema.users.deactivatedAt, pluginSlug: schema.users.pluginSlug })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (user?.pluginSlug) {
    return { code: 'PLUGIN_ACCOUNT', message: "A plugin's user never signs in" };
  }
  if (user?.deactivatedAt) {
    return { code: 'ACCOUNT_DEACTIVATED', message: 'This account is deactivated' };
  }
  return null;
}
