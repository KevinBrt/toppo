import type { UserRef } from '@toppo-tracker/shared';
import { Avatar } from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** Someone an issue names, with their initials; a deleted account shows as such. */
export function PersonName({
  person,
  withAvatar = true,
}: {
  person: UserRef;
  withAvatar?: boolean;
}) {
  const { t } = useI18n();
  const name = person.name ?? t('issues.deletedUser');

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {withAvatar ? <Avatar name={name} className="size-6" /> : null}
      <span className={person.name ? 'truncate' : 'truncate text-muted-foreground italic'}>
        {name}
      </span>
    </span>
  );
}
