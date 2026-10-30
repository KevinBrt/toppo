import { scopeOf } from '@toppo-tracker/core';
import type { Manifest } from '@toppo-tracker/plugin-sdk/protocol';
import { z } from 'zod';
import type { Actor } from '../../../platform/auth/actor.ts';
import { issueKeyOf, resolveIssue } from '../../../platform/auth/project-access.ts';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

type ActionAccess = Manifest['actions'][number]['access'];

const notFound = () => new HttpError(404, 'ISSUE_NOT_FOUND', 'This issue does not exist');

/** A permission an action names, as the catalog does: the plugin's own after its id. */
function catalogName(manifest: Manifest, permission: string): string {
  return Object.hasOwn(manifest.permissions, permission)
    ? `${manifest.id}.${permission}`
    : permission;
}

/**
 * Refuses an action its access does not let the person run, through the plugin: 404 for an issue
 * they or the plugin do not see, as for any issue, 403 without its permission. `context.actor` is
 * the plugin acting for them (`actingFor`).
 */
export async function assertActionAccess(
  context: ExecutionContext & { actor: Actor },
  manifest: Manifest,
  access: ActionAccess,
  input: Record<string, unknown>,
): Promise<void> {
  if (access === 'authenticated') {
    return;
  }
  const { actor } = context;
  const permission =
    access.permission === undefined ? undefined : catalogName(manifest, access.permission);
  let inProject: readonly string[] = [];
  if ('issue' in access) {
    const issueId = z.uuid().safeParse(input[access.issue]);
    const issueKey = issueId.success ? await issueKeyOf(context.db, issueId.data) : null;
    if (issueKey === null) {
      throw notFound();
    }
    inProject = (await resolveIssue(context.db, actor, issueKey)).permissions;
  }
  if (permission === undefined) {
    return;
  }
  const held =
    scopeOf(permission, actor.pluginPermissions) === 'instance' ? actor.permissions : inProject;
  if (!held.includes(permission)) {
    throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to do this');
  }
}
