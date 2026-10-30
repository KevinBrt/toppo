import { createRoute } from '@tanstack/react-router';
import { settingsRoute } from '../settings.route.tsx';

/** The plugins of the instance, as administrators manage them: their list, and each one's page. */
export const pluginsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'plugins',
  staticData: { titleKey: 'plugins.title' },
});
