import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import { EmptyState } from '@toppo-tracker/ui';
import { PuzzleIcon } from 'lucide-react';
import { PluginDetails } from '../../../../features/plugins/components/details/plugin-details.tsx';
import { PluginsQueries } from '../../../../features/plugins/queries/plugins.queries.ts';
import { ProjectPicker } from '../../../../features/projects/components/picker/project-picker.tsx';
import { PERMISSION_MESSAGES } from '../../../../features/roles/constants/permission-messages.constants.ts';
import { RolesQueries } from '../../../../features/roles/queries/roles.queries.ts';
import { SessionQueries } from '../../../../features/session/queries/session.queries.ts';
import { ApiRequestError } from '../../../../shared/api/http.client.ts';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import type { PlainMessageKey } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../../shared/layout/access-denied.tsx';
import { Page, useDocumentTitle } from '../../../../shared/layout/page.tsx';
import { CRUMB_CURRENT_CLASS, type CrumbProps } from '../../../../shared/layout/topbar.tsx';
import { pluginsRoute } from './plugins.route.tsx';

/**
 * The core permissions a plugin may need, named as the roles screen names them: the same words
 * for the same rights. Reading issues is one choice of the roles, seeing them all.
 */
const NEED_LABELS: ReadonlyMap<string, PlainMessageKey> = new Map<string, PlainMessageKey>([
  ['issue.read', 'roles.visibility.label'],
  ...Object.entries(PERMISSION_MESSAGES).map(
    ([permission, { label }]): [string, PlainMessageKey] => [permission, label],
  ),
]);

const managesPlugins = (permissions: readonly string[] | undefined) =>
  Boolean(permissions && can(permissions, 'instance.plugins.manage'));

/** The plugin's name in the top bar, its slug until the name is known. */
function PluginCrumb({ params }: CrumbProps) {
  const { locale } = useI18n();
  const slug = params['pluginSlug'] ?? '';
  const { data: user } = useQuery(SessionQueries.currentUser);
  const { data: plugin } = useQuery({
    ...PluginsQueries.detail(slug),
    enabled: managesPlugins(user?.permissions),
  });
  return (
    <span aria-current="page" className={CRUMB_CURRENT_CLASS}>
      {plugin?.name[locale] ?? slug}
    </span>
  );
}

/** A plugin's page, at its slug: `/settings/plugins/time-tracking`. */
export const pluginRoute = createRoute({
  getParentRoute: () => pluginsRoute,
  path: '$pluginSlug',
  staticData: { crumb: PluginCrumb },
  component: PluginScreen,
});

function PluginScreen() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pluginSlug } = pluginRoute.useParams();
  const { data: user } = useQuery(SessionQueries.currentUser);
  const allowed = managesPlugins(user?.permissions);
  const plugin = useQuery({ ...PluginsQueries.detail(pluginSlug), enabled: allowed });
  useDocumentTitle(plugin.data ? plugin.data.name[locale] : pluginSlug);

  if (!allowed) {
    return (
      <Page title={t('plugins.title')}>
        <AccessDenied />
      </Page>
    );
  }
  if (plugin.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('plugins.pluginLoading')}
      </p>
    );
  }
  if (plugin.isError) {
    const missing = plugin.error instanceof ApiRequestError && plugin.error.status === 404;
    return (
      <Page title={missing ? t('notFound.title') : pluginSlug}>
        <EmptyState
          icon={PuzzleIcon}
          title={missing ? t('notFound.title') : t('errors.unexpected')}
          description={missing ? t('plugins.notFound') : requestErrorMessage(plugin.error, t)}
        />
      </Page>
    );
  }
  // The roles show the permissions each plugin adds.
  const refreshRoles = () => queryClient.invalidateQueries({ queryKey: RolesQueries.all.queryKey });
  return (
    <PluginDetails
      plugin={plugin.data}
      projectPicker={(picker) => <ProjectPicker {...picker} />}
      needLabel={(need) => {
        const label = NEED_LABELS.get(need);
        return label ? t(label) : need;
      }}
      onInstalled={async (slug) => {
        await refreshRoles();
        await navigate({ to: '/settings/plugins/$pluginSlug', params: { pluginSlug: slug } });
      }}
      onUninstalled={async () => {
        await refreshRoles();
        await navigate({ to: '/settings/plugins', replace: true });
      }}
    />
  );
}
