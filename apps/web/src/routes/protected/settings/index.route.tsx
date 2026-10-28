import { createRoute, redirect } from '@tanstack/react-router';
import { EmptyState } from '@toppo-tracker/ui';
import { SlidersHorizontalIcon } from 'lucide-react';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { SETTINGS_NAV } from '../../../shared/layout/navigation.constants.ts';
import { visibleSections } from '../../../shared/layout/navigation.util.ts';
import { Page } from '../../../shared/layout/page.tsx';
import { settingsRoute } from './settings.route.tsx';

/** `/settings` opens the first section the user may manage. */
export const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    const [first] = visibleSections(SETTINGS_NAV, context.user).flatMap((section) => section.items);
    if (first) {
      throw redirect({ to: first.to, replace: true });
    }
  },
  component: SettingsHome,
});

function SettingsHome() {
  const { t } = useI18n();
  return (
    <Page title={t('nav.settings')}>
      <EmptyState
        icon={SlidersHorizontalIcon}
        title={t('settings.emptyTitle')}
        description={t('settings.emptyDescription')}
      />
    </Page>
  );
}
