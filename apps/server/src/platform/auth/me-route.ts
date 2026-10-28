import { type Db, schema } from '@toppo-tracker/db';
import {
  DEFAULT_LOCALE,
  type MeResponse,
  meResponseSchema,
  NOTIFICATION_EVENTS,
} from '@toppo-tracker/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '../http/zod.ts';
import { resolveActor } from './actor.ts';
import type { Auth } from './auth.ts';
import { managedBy } from './project-access.ts';

const { projects, users } = schema;

/**
 * `GET /api/v1/me`: the signed-in user, their permissions and whether they manage a project (the
 * web app shows the projects screen to them), or `null`. Public on purpose:
 * "nobody" is a normal answer for the web app deciding between the sign-in page and the app.
 */
export function registerMeRoute(app: FastifyInstance, { auth, db }: { auth: Auth; db: Db }): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/v1/me',
    {
      config: { access: 'public' },
      schema: { response: { 200: meResponseSchema } },
    },
    async (request, reply): Promise<MeResponse> => {
      const actor = await resolveActor({ auth, db }, request, reply);
      reply.header('cache-control', 'no-store');
      if (!actor) {
        return { user: null };
      }
      const [me] = await db
        .select({
          locale: users.locale,
          emailMutedEvents: users.emailMutedEvents,
          managesProjects: sql<boolean>`exists (
            select 1 from ${projects} where ${managedBy(actor.id)}
          )`,
        })
        .from(users)
        .where(eq(users.id, actor.id));
      return {
        user: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
          locale: me?.locale ?? DEFAULT_LOCALE,
          emailedEvents: NOTIFICATION_EVENTS.filter(
            (event) => !me?.emailMutedEvents.includes(event),
          ),
          permissions: [...actor.permissions],
          managesProjects: me?.managesProjects ?? false,
        },
      };
    },
  );
}
