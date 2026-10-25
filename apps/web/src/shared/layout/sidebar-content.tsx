import { Link } from '@tanstack/react-router';
import { Logo } from '@toppo/ui';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n-provider.tsx';
import { NAV_SECTIONS, type NavAudience } from './navigation.constants.ts';
import { visibleSections } from './navigation.util.ts';

/** Brand and main navigation. Rendered in the fixed sidebar on desktop and in the drawer on mobile. */
export function SidebarContent({
  audience,
  footer,
  onNavigate,
}: {
  /** The signed-in user: links they could not use are left out. */
  audience: NavAudience;
  /** Shown at the bottom, e.g. the signed-in account. */
  footer?: ReactNode;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const sections = visibleSections(NAV_SECTIONS, audience);

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <Logo className="h-7" />
        <span className="text-[15px] font-semibold tracking-tight">{t('app.name')}</span>
      </div>

      <nav aria-label={t('nav.label')} className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.labelKey ?? 'main'} className="mt-2 first:mt-0">
            {section.labelKey ? (
              <p className="px-3 pt-4 pb-2 text-xs font-medium text-sidebar-muted">
                {t(section.labelKey)}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map(({ to, labelKey, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={onNavigate}
                    className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground pointer-coarse:min-h-11 data-[status=active]:bg-sidebar-active data-[status=active]:text-white"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {t(labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {footer}
    </div>
  );
}
