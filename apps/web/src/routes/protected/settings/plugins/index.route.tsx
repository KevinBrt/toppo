import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import { InstallPlugin } from '../../../../features/plugins/components/install-plugin.tsx';
import { PluginsList } from '../../../../features/plugins/components/list/plugins-list.tsx';
import { RolesQueries } from '../../../../features/roles/queries/roles.queries.ts';
import { SessionQueries } from '../../../../features/session/queries/session.queries.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../../shared/layout/access-denied.tsx';
import { Page } from '../../../../shared/layout/page.tsx';
import { pluginsRoute } from './plugins.route.tsx';

/** The plugins installed, and installing another one, which opens its page to approve it. */
export const pluginsIndexRoute = createRoute({
  getParentRoute: () => pluginsRoute,
  path: '/',
  component: PluginsScreen,
});

function PluginsScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useQuery(SessionQueries.currentUser);

  if (!(user && can(user.permissions, 'instance.plugins.manage'))) {
    return (
      <Page title={t('plugins.title')}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <Page
      title={t('plugins.title')}
      description={t('plugins.description')}
      actions={
        <InstallPlugin
          label={t('plugins.install')}
          onInstalled={async (slug) => {
            // The roles show the permissions each plugin adds.
            await queryClient.invalidateQueries({ queryKey: RolesQueries.all.queryKey });
            await navigate({ to: '/settings/plugins/$pluginSlug', params: { pluginSlug: slug } });
          }}
        />
      }
    >
      <PluginsList />
    </Page>
  );
}
