import { useQuery } from '@tanstack/react-query';
import { createRoute, Outlet } from '@tanstack/react-router';
import { canAny } from '@toppo-tracker/core';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { SETTINGS_NAV, SETTINGS_PERMISSIONS } from '../../../shared/layout/navigation.constants.ts';
import { visibleSections } from '../../../shared/layout/navigation.util.ts';
import { Page } from '../../../shared/layout/page.tsx';
import { SectionLayout } from '../../../shared/layout/section-layout.tsx';
import { protectedRoute } from '../protected.route.tsx';

/** The settings frame: their own navigation beside the page of the chosen section. */
export const settingsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/settings',
  staticData: { titleKey: 'nav.settings' },
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useI18n();
  const { data: user } = useQuery(SessionQueries.currentUser);
  const permissions = user?.permissions ?? [];

  if (!canAny(permissions, SETTINGS_PERMISSIONS)) {
    return (
      <Page title={t('nav.settings')}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <SectionLayout
      label={t('settings.navLabel')}
      sections={visibleSections(SETTINGS_NAV, { permissions })}
    >
      <Outlet />
    </SectionLayout>
  );
}
