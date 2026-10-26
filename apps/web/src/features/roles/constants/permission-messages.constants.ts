import type { PlainMessageKey } from '../../../shared/i18n/i18n.types.ts';
import type { SwitchPermission } from '../utils/permission-matrix.util.ts';

interface PermissionMessages {
  label: PlainMessageKey;
  description: PlainMessageKey;
}

/**
 * The label and help of each switch of the matrix. Typed against the catalog: a new permission
 * fails the build until it is described. The two that read issues share the visibility row.
 */
export const PERMISSION_MESSAGES: Readonly<Record<SwitchPermission, PermissionMessages>> = {
  'issue.create': {
    label: 'roles.permissions.issueCreate.label',
    description: 'roles.permissions.issueCreate.description',
  },
  'issue.update': {
    label: 'roles.permissions.issueUpdate.label',
    description: 'roles.permissions.issueUpdate.description',
  },
  'issue.assign': {
    label: 'roles.permissions.issueAssign.label',
    description: 'roles.permissions.issueAssign.description',
  },
  'issue.delete': {
    label: 'roles.permissions.issueDelete.label',
    description: 'roles.permissions.issueDelete.description',
  },
  'comment.create': {
    label: 'roles.permissions.commentCreate.label',
    description: 'roles.permissions.commentCreate.description',
  },
  'comment.moderate': {
    label: 'roles.permissions.commentModerate.label',
    description: 'roles.permissions.commentModerate.description',
  },
  'project.settings.manage': {
    label: 'roles.permissions.projectSettings.label',
    description: 'roles.permissions.projectSettings.description',
  },
  'project.members.manage': {
    label: 'roles.permissions.projectMembers.label',
    description: 'roles.permissions.projectMembers.description',
  },
  'instance.users.manage': {
    label: 'roles.permissions.usersManage.label',
    description: 'roles.permissions.usersManage.description',
  },
  'project.create': {
    label: 'roles.permissions.projectCreate.label',
    description: 'roles.permissions.projectCreate.description',
  },
  'project.delete': {
    label: 'roles.permissions.projectDelete.label',
    description: 'roles.permissions.projectDelete.description',
  },
  'instance.settings.manage': {
    label: 'roles.permissions.settingsManage.label',
    description: 'roles.permissions.settingsManage.description',
  },
  'instance.mail.manage': {
    label: 'roles.permissions.mailManage.label',
    description: 'roles.permissions.mailManage.description',
  },
  'instance.roles.manage': {
    label: 'roles.permissions.rolesManage.label',
    description: 'roles.permissions.rolesManage.description',
  },
};
