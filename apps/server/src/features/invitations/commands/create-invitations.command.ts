import { canActOnRole, invitationExpiry } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import {
  type CreateInvitationsResponse,
  createInvitationsRequestSchema,
} from '@toppo-tracker/shared';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { reachableBy, reachesEveryProject } from '../../../platform/auth/project-access.ts';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { emailInvitations } from '../jobs/email-invitation.job.ts';
import {
  hashInvitationToken,
  invitationLink,
  newInvitationToken,
} from '../utils/invitation-token.util.ts';

const { invitationProjects, invitations, projects, roles, users } = schema;

/** Arbitrary but fixed: two administrators inviting the same address at once are serialized. */
const INVITATIONS_LOCK_KEY = 7_461_756_325;

/**
 * Invites addresses with one role, and access to every project or to chosen ones (none by
 * default). Inviting an address again replaces its pending invitation,
 * whose link stops working; addresses of existing members are left out. Each link is emailed
 * when email is set up. Unlike other commands it returns more than ids: the links exist only
 * now, since only their hash is stored.
 */
export const createInvitations = defineCommand({
  name: 'invitation.create',
  access: { permission: 'instance.users.manage' },
  input: createInvitationsRequestSchema,
  async handler(
    { tx, actor, services, log },
    { emails, roleId, allProjects, projectKeys },
  ): Promise<CreateInvitationsResponse> {
    // Share-locked: the role cannot be deleted before the invitations that give it exist.
    const [role] = await tx
      .select({ grantsAll: roles.grantsAll })
      .from(roles)
      .where(eq(roles.id, roleId))
      .for('key share');
    if (!role) {
      throw new HttpError(400, 'INVALID_ROLE', 'This role does not exist');
    }
    if (!canActOnRole(actor.permissions, role)) {
      throw new HttpError(403, 'SYSTEM_ROLE_RESERVED', 'Only administrators handle that role');
    }
    // Only projects the inviter reaches: inviting never reveals, nor opens, one they do not know.
    if (allProjects && !(await reachesEveryProject(tx, actor.id))) {
      throw new HttpError(
        403,
        'ALL_PROJECTS_RESERVED',
        'Only someone who reaches every project may change this access',
      );
    }
    const keys = allProjects ? [] : [...new Set(projectKeys)];
    const chosen =
      keys.length === 0
        ? []
        : await tx
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(inArray(projects.key, keys), isNull(projects.archivedAt), reachableBy(actor.id)),
            );
    if (chosen.length !== keys.length) {
      throw new HttpError(400, 'INVALID_PROJECT', 'A chosen project does not exist');
    }

    await tx.execute(sql`select pg_advisory_xact_lock(${INVITATIONS_LOCK_KEY})`);
    const addresses = [...new Set(emails)];
    const members = await tx
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.email, addresses));
    const alreadyMembers = new Set(members.map((member) => member.email));
    const invited = addresses
      .filter((email) => !alreadyMembers.has(email))
      .map((email) => ({ id: uuidv7(), email, token: newInvitationToken() }));
    if (invited.length === 0) {
      return { invitations: [], alreadyMembers: [...alreadyMembers] };
    }

    await tx.delete(invitations).where(
      and(
        inArray(
          invitations.email,
          invited.map(({ email }) => email),
        ),
        isNull(invitations.acceptedAt),
      ),
    );
    const expiresAt = invitationExpiry(new Date());
    await tx.insert(invitations).values(
      invited.map(({ id, email, token }) => ({
        id,
        email,
        roleId,
        tokenHash: hashInvitationToken(token),
        invitedById: actor.id,
        expiresAt,
        allProjects,
      })),
    );
    if (chosen.length > 0) {
      await tx
        .insert(invitationProjects)
        .values(
          invited.flatMap(({ id: invitationId }) =>
            chosen.map(({ id: projectId }) => ({ invitationId, projectId })),
          ),
        );
    }

    const emailed = await emailInvitations(tx, services, invited);
    log.info({ count: invited.length, roleId, emailed, by: actor.id }, 'Members invited');
    return {
      invitations: invited.map(({ id, email, token }) => ({
        id,
        email,
        link: invitationLink(services.publicUrl, token),
        emailed,
      })),
      alreadyMembers: [...alreadyMembers],
    };
  },
});
