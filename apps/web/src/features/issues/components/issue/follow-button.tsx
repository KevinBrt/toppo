import { Button } from '@toppo/ui';
import { BellIcon, BellOffIcon } from 'lucide-react';
import { useId } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';

/** Follows the issue or stops, showing how many people follow it. */
export function FollowButton({
  following,
  followerCount,
  onFollow,
}: {
  following: boolean;
  followerCount: number;
  onFollow: (following: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const countId = useId();

  return (
    <>
      <Button variant="secondary" aria-describedby={countId} onClick={() => onFollow(!following)}>
        {following ? <BellOffIcon aria-hidden="true" /> : <BellIcon aria-hidden="true" />}
        {following ? t('issues.unfollow') : t('issues.follow')}
        <span aria-hidden="true" className="text-muted-foreground tabular-nums">
          {followerCount}
        </span>
      </Button>
      <span id={countId} className="sr-only">
        {t(`issues.followerCount.${pluralForm(locale, followerCount)}`, { count: followerCount })}
      </span>
    </>
  );
}
