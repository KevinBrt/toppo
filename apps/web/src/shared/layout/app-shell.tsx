import { Outlet } from '@tanstack/react-router';
import { Sheet, SheetContent } from '@toppo-tracker/ui';
import { type ReactNode, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider.tsx';
import type { AddedNavSection, NavAudience } from './navigation.constants.ts';
import { SidebarContent } from './sidebar-content.tsx';
import { Topbar } from './topbar.tsx';

/**
 * Application frame. From `lg` up the sidebar is fixed on the left; below, it moves into a
 * drawer opened from the top bar, so every screen works from 320 px phones to wide desktops.
 * Who the user is and the sidebar footer come from the caller, so this frame stays free of any
 * feature.
 */
export function AppShell({
  audience,
  addedSections = [],
  sidebarFooter,
  topbarEnd,
}: {
  /** The signed-in user: the navigation hides what they could not use. */
  audience: NavAudience;
  /** Entries after the app's own: plugins' pages. */
  addedSections?: readonly AddedNavSection[];
  /** Drawn in the sidebar and in the drawer, whose links call `onNavigate` to close it. */
  sidebarFooter?: (options: { onNavigate?: () => void }) => ReactNode;
  /** Drawn at the right of the top bar, e.g. the way to search. */
  topbarEnd?: ReactNode;
}) {
  const { t } = useI18n();
  const [isMenuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:pl-60">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-4 py-2 text-sm font-medium shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('app.skipToContent')}
      </a>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-sidebar-border lg:flex">
        <SidebarContent
          audience={audience}
          addedSections={addedSections}
          footer={sidebarFooter?.({})}
        />
      </aside>

      <Sheet open={isMenuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          title={t('nav.label')}
          closeLabel={t('nav.closeMenu')}
          className="bg-sidebar text-sidebar-foreground lg:hidden"
        >
          <SidebarContent
            audience={audience}
            addedSections={addedSections}
            footer={sidebarFooter?.({ onNavigate: () => setMenuOpen(false) })}
            onNavigate={() => setMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <Topbar onOpenMenu={() => setMenuOpen(true)} end={topbarEnd} />

      <main
        id="main"
        tabIndex={-1}
        className="px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <Outlet />
      </main>
    </div>
  );
}
