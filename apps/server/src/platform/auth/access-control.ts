import { can, type InstancePermission, type Permission } from '@toppo-tracker/core';
import type { Db } from '@toppo-tracker/db';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../http/http-error.ts';
import { type Actor, resolveActor } from './actor.ts';
import type { Auth } from './auth.ts';
import {
  type ProjectContext,
  projectKeyIn,
  resolveIssue,
  resolveProject,
} from './project-access.ts';

/** Input fields that name a project: its key (`WEB`), or the key of one of its issues (`WEB-42`). */
export type ProjectField = 'projectKey' | 'issueKey';

/**
 * Access to the project an input names, and to the issue when it is an issue key: a member who
 * reaches the project, sees the issue and, when `permission` is given, holds it: a project
 * permission in that project, an instance one through their own role (to delete the project).
 * The field is part of the route's path, so a route checks it before reading the body.
 */
export interface ProjectAccessRule<Input = never> {
  project: ProjectField & keyof Input;
  permission?: Permission;
  /** An archived project is read-only: commands on it are refused unless this is set (to unarchive it). */
  evenArchived?: true;
}

/**
 * Who may call a route or run a command or query:
 * - `public`: anyone, signed in or not;
 * - `authenticated`: any signed-in user;
 * - `{ permission }`: a signed-in user whose instance role grants this permission;
 * - `{ project, permission? }`: a member of the project the input names (see `ProjectAccessRule`).
 */
export type Access<Input = never> =
  | 'public'
  | 'authenticated'
  | { permission: InstancePermission }
  | ProjectAccessRule<Input>;

export function isProjectAccess<Input>(access: Access<Input>): access is ProjectAccessRule<Input> {
  return typeof access === 'object' && 'project' in access;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user, set on routes whose access requires one. */
    actor: Actor | null;
    /** The project a project route is about, once the actor's access to it is checked. */
    project: ProjectContext | null;
  }
}

/**
 * Throws the HTTP error that `access` calls for when `actor` may not go further. Access to a
 * project needs the input: here, only a signed-in user is required.
 */
export function assertAccess<Input>(access: Access<Input>, actor: Actor | null): void {
  if (access === 'public') {
    return;
  }
  if (!actor) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (access === 'authenticated' || isProjectAccess(access)) {
    return;
  }
  if (!can(actor.permissions, access.permission)) {
    throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to do this');
  }
}

/**
 * Enforces `config.access` before the body is even parsed: a caller without access learns
 * nothing about a protected route, not even its validation rules, nor whether a project exists.
 */
export function registerAccessControl(
  app: FastifyInstance,
  { auth, db }: { auth: Auth; db: Db },
): void {
  app.decorateRequest('actor', null);
  app.decorateRequest('project', null);

  app.addHook('onRequest', async (request, reply) => {
    const access = request.routeOptions.config.access ?? 'public';
    if (access === 'public') {
      return;
    }
    request.actor = await resolveActor({ auth, db }, request, reply);
    assertAccess(access, request.actor);
    if (request.actor && isProjectAccess(access)) {
      const params = request.params as Readonly<Record<string, string | undefined>>;
      const value = params[access.project];
      request.project =
        access.project === 'issueKey'
          ? await resolveIssue(db, request.actor, value, access.permission)
          : await resolveProject(
              db,
              request.actor,
              projectKeyIn(access.project, value),
              access.permission,
            );
    }
  });
}
