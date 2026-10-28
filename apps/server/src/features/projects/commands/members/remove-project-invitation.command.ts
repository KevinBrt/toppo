import { canActOnProjectMember } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { projectInvitationParamsSchema } from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';

const { invitationProjects, invitations, roles } = schema;

/**
 * Takes the project out of a pending invitation: the person will not reach it on joining. An
 * invitation giving every project is not changed here. As for members, nobody acts on an
 * invitation whose role exceeds what they hold in the project.
 */
export const removeProjectInvitation = defineCommand({
  name: 'project.removeInvitation',
  access: { project: 'projectKey', permission: 'project.members.manage' },
  input: projectInvitationParamsSchema,
  async handler({ tx, actor, project, log }, { invitationId }): Promise<void> {
    const [invited] = await tx
      .select({
        id: invitationProjects.id,
        role: { grantsAll: roles.grantsAll, permissions: roles.permissions },
      })
      .from(invitationProjects)
      .innerJoin(invitations, eq(invitations.id, invitationProjects.invitationId))
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .where(
        and(
          eq(invitationProjects.projectId, project.id),
          eq(invitationProjects.invitationId, invitationId),
          isNull(invitations.acceptedAt),
        ),
      )
      .for('update', { of: invitationProjects });
    if (!invited) {
      throw new HttpError(404, 'INVITATION_NOT_FOUND', 'No pending invitation gives this project');
    }
    if (!canActOnProjectMember(project.permissions, invited.role, actor.pluginPermissions)) {
      throw new HttpError(
        403,
        'ROLE_BEYOND_YOURS',
        'You cannot act on more than you hold in this project',
      );
    }

    await tx.delete(invitationProjects).where(eq(invitationProjects.id, invited.id));
    log.info({ projectId: project.id, invitationId, by: actor.id }, 'Invitation project removed');
  },
});
