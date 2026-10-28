import { type InstancePermission, instancePermissionsOf } from '@toppo-tracker/core';
import { type Db, schema } from '@toppo-tracker/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from './auth.ts';
import { forwardSetCookies, toFetchHeaders } from './fetch-bridge.ts';

const { roles, users } = schema;

/** Who runs a request: the signed-in user and what their instance role lets them do. */
export interface Actor {
  id: string;
  name: string;
  email: string;
  permissions: readonly InstancePermission[];
}

/**
 * The signed-in user behind a request, or `null`. The session comes from Better Auth, then the
 * user and their role's permissions from one query: a role change or a deactivation applies on
 * the next request.
 */
export async function resolveActor(
  { auth, db }: { auth: Auth; db: Db },
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Actor | null> {
  const { headers, response: session } = await auth.api.getSession({
    headers: toFetchHeaders(request),
    returnHeaders: true,
  });
  // A sliding session renews its cookie from time to time.
  forwardSetCookies(headers, reply);
  if (!session) {
    return null;
  }
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: { grantsAll: roles.grantsAll, permissions: roles.permissions },
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.instanceRoleId))
    .where(and(eq(users.id, session.user.id), isNull(users.deactivatedAt)));
  if (!user) {
    return null;
  }
  const { role, ...identity } = user;
  return { ...identity, permissions: instancePermissionsOf(role) };
}
