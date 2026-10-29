import type { QueryClient } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { accountRoute } from './routes/protected/account/account.route.tsx';
import { indexRoute } from './routes/protected/index.route.tsx';
import { issuesIndexRoute } from './routes/protected/issues/index.route.tsx';
import { issueRoute } from './routes/protected/issues/issue.route.tsx';
import { issuesRoute } from './routes/protected/issues/issues.route.tsx';
import { myIssuesRoute } from './routes/protected/issues/my-issues.route.tsx';
import { newIssueRoute } from './routes/protected/issues/new-issue.route.tsx';
import { notFoundRoute } from './routes/protected/not-found.route.tsx';
import { notificationsRoute } from './routes/protected/notifications/notifications.route.tsx';
import { pluginPageRoute } from './routes/protected/plugins/plugin-page.route.tsx';
import { projectsIndexRoute } from './routes/protected/projects/index.route.tsx';
import { projectRoute } from './routes/protected/projects/project.route.tsx';
import { projectAccessRoute } from './routes/protected/projects/project-access.route.tsx';
import { projectGeneralRoute } from './routes/protected/projects/project-general.route.tsx';
import { projectPluginPageRoute } from './routes/protected/projects/project-plugin-page.route.tsx';
import { projectPluginsRoute } from './routes/protected/projects/project-plugins.route.tsx';
import { projectPropertiesRoute } from './routes/protected/projects/project-properties.route.tsx';
import { projectStatusesRoute } from './routes/protected/projects/project-statuses.route.tsx';
import { projectsRoute } from './routes/protected/projects/projects.route.tsx';
import { protectedRoute } from './routes/protected/protected.route.tsx';
import { emailRoute } from './routes/protected/settings/email.route.tsx';
import { settingsIndexRoute } from './routes/protected/settings/index.route.tsx';
import { membersRoute } from './routes/protected/settings/members.route.tsx';
import { pluginsIndexRoute } from './routes/protected/settings/plugins/index.route.tsx';
import { pluginRoute } from './routes/protected/settings/plugins/plugin.route.tsx';
import { pluginSettingsPageRoute } from './routes/protected/settings/plugins/plugin-settings-page.route.tsx';
import { pluginsRoute } from './routes/protected/settings/plugins/plugins.route.tsx';
import { propertiesRoute } from './routes/protected/settings/properties.route.tsx';
import { rolesRoute } from './routes/protected/settings/roles.route.tsx';
import { settingsRoute } from './routes/protected/settings/settings.route.tsx';
import { statusesRoute } from './routes/protected/settings/statuses.route.tsx';
import { forgotPasswordRoute } from './routes/public/forgot-password.route.tsx';
import { invitationRoute } from './routes/public/invitation.route.tsx';
import { loginRoute } from './routes/public/login.route.tsx';
import { resetPasswordRoute } from './routes/public/reset-password.route.tsx';
import { setupRoute } from './routes/public/setup.route.tsx';
import { rootRoute } from './routes/root.route.tsx';
import type { PlainMessageKey } from './shared/i18n/i18n.types.ts';
import type { CrumbProps } from './shared/layout/topbar.tsx';

const routeTree = rootRoute.addChildren([
  // Reachable without a session.
  setupRoute,
  loginRoute,
  invitationRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  // Behind sign-in, inside the application frame.
  protectedRoute.addChildren([
    indexRoute,
    issuesRoute.addChildren([issuesIndexRoute, newIssueRoute, issueRoute]),
    myIssuesRoute,
    notificationsRoute,
    pluginPageRoute,
    projectsRoute.addChildren([
      projectsIndexRoute,
      projectRoute.addChildren([
        projectGeneralRoute,
        projectAccessRoute,
        projectStatusesRoute,
        projectPropertiesRoute,
        projectPluginsRoute,
        projectPluginPageRoute,
      ]),
    ]),
    settingsRoute.addChildren([
      settingsIndexRoute,
      membersRoute,
      rolesRoute,
      statusesRoute,
      propertiesRoute,
      emailRoute,
      pluginsRoute.addChildren([pluginsIndexRoute, pluginRoute]),
      pluginSettingsPageRoute,
    ]),
    accountRoute,
    notFoundRoute,
  ]),
]);

export function createAppRouter({
  queryClient,
  history,
}: {
  queryClient: QueryClient;
  history?: RouterHistory;
}) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Route guards read the query cache; TanStack Query decides when data is stale.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    ...(history ? { history } : {}),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
  interface HistoryState {
    /** The address of someone who just accepted an invitation, for the sign-in page. */
    invitedEmail?: string;
    /** Set by the page that changed a forgotten password, to say so on the sign-in page. */
    passwordChanged?: boolean;
  }
  interface StaticDataRouteOption {
    /** Title shown in the top bar and the browser tab. */
    titleKey?: PlainMessageKey;
    /** For a route about one record, its own step in the top bar, e.g. the project's name. */
    crumb?: ComponentType<CrumbProps>;
  }
}
