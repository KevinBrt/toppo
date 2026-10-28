import { useQuery } from '@tanstack/react-query';
import { createRoute, redirect, useRouter } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import { PlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CommandPalette } from '../../features/issues/components/palette/command-palette.tsx';
import { PaletteButton } from '../../features/issues/components/palette/palette-button.tsx';
import type { PaletteCommand } from '../../features/issues/models/palette.model.ts';
import { lastProject } from '../../features/issues/utils/last-project.util.ts';
import { NotificationBell } from '../../features/notifications/components/notification-bell.tsx';
import { AccountFooter } from '../../features/session/components/account-footer.tsx';
import { loadSession, SessionQueries } from '../../features/session/queries/session.queries.ts';
import { AppVersion } from '../../features/updates/components/app-version.tsx';
import { UpdateNotice } from '../../features/updates/components/update-notice.tsx';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { isPaletteShortcut } from '../../shared/keyboard/palette-shortcut.util.ts';
import { AppShell } from '../../shared/layout/app-shell.tsx';
import { NAV_SECTIONS } from '../../shared/layout/navigation.constants.ts';
import { visibleSections } from '../../shared/layout/navigation.util.ts';
import { rootRoute } from '../root.route.tsx';

/** Everything behind sign-in, inside the application frame. */
export const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  beforeLoad: async ({ context, location }) => {
    const { setupRequired, user } = await loadSession(context.queryClient);
    if (setupRequired) {
      throw redirect({ to: '/setup', replace: true });
    }
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href }, replace: true });
    }
    return { user };
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  const router = useRouter();
  const { t } = useI18n();
  // From the cache rather than the route context, so a refreshed role shows without navigating.
  const { data: user } = useQuery(SessionQueries.currentUser);
  const audience = user ?? { permissions: [] };
  const [searching, setSearching] = useState(false);

  // ⌘K or Ctrl K, wherever the focus is: the one shortcut of the application.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isPaletteShortcut(event)) {
        event.preventDefault();
        setSearching((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A new issue goes to the project looked at last, when there is one.
  const project = lastProject();
  const newIssue: PaletteCommand[] = project
    ? [
        {
          id: 'new-issue',
          label: t('issues.newIssue'),
          icon: PlusIcon,
          run: () => router.navigate({ to: '/issues/new', search: { project } }),
        },
      ]
    : [];
  const pages = visibleSections(NAV_SECTIONS, audience)
    .flatMap(({ items }) => items)
    .map(
      (item): PaletteCommand => ({
        id: item.to,
        label: t(item.labelKey),
        icon: item.icon,
        run: () => router.navigate({ to: item.to }),
      }),
    );

  return (
    <>
      <AppShell
        audience={audience}
        sidebarFooter={({ onNavigate }) => (
          <>
            <UpdateNotice enabled={can(audience.permissions, 'instance.settings.manage')} />
            <AccountFooter
              onNavigate={onNavigate}
              onSignedOut={() => router.navigate({ to: '/login' })}
            />
            <AppVersion />
          </>
        )}
        topbarEnd={
          <>
            <PaletteButton onOpen={() => setSearching(true)} />
            <NotificationBell />
          </>
        }
      />
      <CommandPalette
        open={searching}
        onOpenChange={setSearching}
        commands={[...newIssue, ...pages]}
        onOpenIssue={(issueKey) =>
          router.navigate({ to: '/issues/$issueKey', params: { issueKey } })
        }
      />
    </>
  );
}
