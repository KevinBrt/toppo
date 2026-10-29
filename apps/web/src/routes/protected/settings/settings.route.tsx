import { useQuery } from '@tanstack/react-query';
import { createRoute, Outlet } from '@tanstack/react-router';
import { canAny } from '@toppo-tracker/core';
import { PluginsQueries } from '../../../features/plugins/queries/plugins.queries.ts';
import { pluginNavSections } from '../../../features/plugins/utils/plugin-nav.util.ts';
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
  const { t, locale } = useI18n();
  const { data: user } = useQuery(SessionQueries.currentUser);
  const permissions = user?.permissions ?? [];
  const { data: screens } = useQuery(PluginsQueries.screens);
  // A section per plugin with pages here, named after it, after Toppo's own.
  const pluginSections = pluginNavSections(screens?.settings ?? [], locale, (screen) => ({
    to: '/settings/p/$pluginSlug/$screen',
    params: { pluginSlug: screen.pluginSlug, screen: screen.name },
  }));

  if (!canAny(permissions, SETTINGS_PERMISSIONS) && pluginSections.length === 0) {
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
      addedSections={pluginSections}
    >
      <Outlet />
    </SectionLayout>
  );
}
