import { EmptyState } from '@toppo-tracker/ui';
import { LockIcon } from 'lucide-react';
import { useI18n } from '../i18n/i18n-provider.tsx';

/**
 * Shown instead of a screen the user's role does not open. Links to it are hidden already; this
 * covers a typed or bookmarked address. The server refuses the data anyway.
 */
export function AccessDenied() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={LockIcon}
      title={t('accessDenied.title')}
      description={t('accessDenied.description')}
    />
  );
}
