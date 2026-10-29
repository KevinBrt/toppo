import { useQuery } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import { SessionQueries } from '../../../../features/session/queries/session.queries.ts';
import { settingsRoute } from '../settings.route.tsx';

/** The webhooks of the instance: their list, a new one, and each one's page. */
export const webhooksRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'webhooks',
  staticData: { titleKey: 'webhooks.title' },
});

/** Whether the signed-in user manages webhooks: the screens below show nothing else otherwise. */
export function useManagesWebhooks(): boolean {
  const { data: user } = useQuery(SessionQueries.currentUser);
  return Boolean(user && can(user.permissions, 'instance.webhooks.manage'));
}
