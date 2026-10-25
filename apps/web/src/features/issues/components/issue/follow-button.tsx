import { Button } from '@toppo/ui';
import { BellIcon, BellOffIcon } from 'lucide-react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** Follows the issue, or stops. */
export function FollowButton({
  following,
  onFollow,
}: {
  following: boolean;
  onFollow: (following: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <Button variant="secondary" onClick={() => onFollow(!following)}>
      {following ? <BellOffIcon aria-hidden="true" /> : <BellIcon aria-hidden="true" />}
      {following ? t('issues.unfollow') : t('issues.follow')}
    </Button>
  );
}
