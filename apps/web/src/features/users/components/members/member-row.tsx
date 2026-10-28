import type { AssignableRolesResponse, UserSummary } from '@toppo-tracker/shared';
import { Avatar, Badge, BadgeSelect, cn } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { UserChange } from '../../models/user-change.model.ts';
import { MemberActions } from './member-actions.tsx';

interface MemberRowProps {
  member: UserSummary;
  roles: AssignableRolesResponse['roles'];
  isCurrentUser: boolean;
  onChange: (change: UserChange) => void;
}

/**
 * One member: who it is, its role, whether it can sign in, and its actions. Phones keep the
 * member, the role and the menu; the state moves under the email.
 */
export function MemberRow({ member, roles, isCurrentUser, onChange }: MemberRowProps) {
  const { t } = useI18n();
  const deactivated = member.deactivatedAt !== null;
  // Until the roles arrive, the select still shows the member's own.
  const options = (roles.length > 0 ? roles : [member.role]).map((role) => ({
    value: role.id,
    label: role.name,
    tone: role.color,
  }));

  return (
    <tr>
      <td className="py-3 pr-2 pl-4">
        <div className={cn('flex min-w-0 items-center gap-3', deactivated && 'opacity-60')}>
          <Avatar name={member.name} className="hidden sm:flex" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {member.name}
              {isCurrentUser ? (
                <span className="ml-1 font-normal text-muted-foreground">{t('members.you')}</span>
              ) : null}
            </p>
            <p className="truncate text-muted-foreground">{member.email}</p>
            <MemberState deactivated={deactivated} className="mt-1 md:hidden" />
          </div>
        </div>
      </td>
      <td className="px-2 py-3">
        {/* One's own role is changed by another administrator, never by oneself. */}
        {isCurrentUser ? (
          <Badge tone={member.role.color}>{member.role.name}</Badge>
        ) : (
          <BadgeSelect
            aria-label={t('members.roleOf', { name: member.name })}
            options={options}
            value={member.role.id}
            onValueChange={(roleId) => onChange({ type: 'changeRole', userId: member.id, roleId })}
            className="max-w-full"
          />
        )}
      </td>
      <td className="hidden px-2 py-3 md:table-cell">
        <MemberState deactivated={deactivated} />
      </td>
      <td className="py-3 pr-2 text-right">
        {isCurrentUser ? null : <MemberActions member={member} onChange={onChange} />}
      </td>
    </tr>
  );
}

function MemberState({ deactivated, className }: { deactivated: boolean; className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        deactivated ? 'text-muted-foreground' : 'text-success',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {deactivated ? t('members.deactivated') : t('members.active')}
    </span>
  );
}
