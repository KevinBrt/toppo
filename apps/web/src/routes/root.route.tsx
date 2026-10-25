import { type QueryClient, useQuery } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { SessionQueries } from '../features/session/queries/session.queries.ts';
import { I18nProvider, useI18n } from '../shared/i18n/i18n-provider.tsx';

export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Speaks the language saved on the account once someone is signed in, the same on every device;
 * the browser's before. Reads the session the guards loaded, without asking for it.
 */
function Root() {
  const { locale: browser } = useI18n();
  const { data: user } = useQuery({ ...SessionQueries.currentUser, enabled: false });

  return (
    <I18nProvider locale={user?.locale ?? browser}>
      <Outlet />
    </I18nProvider>
  );
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Root,
});
