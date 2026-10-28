import { Link, useMatches } from '@tanstack/react-router';
import { Button } from '@toppo-tracker/ui';
import { MenuIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n-provider.tsx';

/** What a route's own breadcrumb step gets, to show itself: a name, a link, a menu. */
export interface CrumbProps {
  params: Readonly<Record<string, string | undefined>>;
  search: Readonly<Record<string, unknown>>;
  /** The page being shown: the step is not a link then. */
  current: boolean;
}

/** How steps of the path look: a link to a parent page, or the page being shown. */
export const CRUMB_LINK_CLASS = 'text-muted-foreground hover:text-foreground';
export const CRUMB_CURRENT_CLASS = 'truncate font-medium text-foreground';

type RoutePath = ReturnType<typeof useMatches>[number]['fullPath'];
/** Index routes (`/settings/`) never carry a title, so they are never a step of the path. */
type StepPath = Exclude<RoutePath, `${string}/`> | '/';

function isStepPath(path: RoutePath): path is StepPath {
  return path === '/' || !path.endsWith('/');
}

/** A step of the path: a title, or a route's own way of showing itself. */
type Crumb =
  | { id: string; to: StepPath; label: string }
  | { id: string; to: StepPath; own: (current: boolean) => ReactNode };

/**
 * Every matched route with a title is a step of the path: Projects / WEB / Settings. A route
 * about one record shows its own step, e.g. a menu to switch projects.
 */
function useCrumbs(): Crumb[] {
  const { t } = useI18n();
  return useMatches().flatMap((match): Crumb[] => {
    const path: RoutePath = match.fullPath;
    const { titleKey, crumb: Crumb } = match.staticData;
    const params: Readonly<Record<string, string | undefined>> = match.params;
    const search: Readonly<Record<string, unknown>> = match.search;
    if (!isStepPath(path)) {
      return [];
    }
    if (titleKey) {
      return [{ id: match.id, to: path, label: t(titleKey) }];
    }
    return Crumb
      ? [
          {
            id: match.id,
            to: path,
            own: (current: boolean): ReactNode => (
              <Crumb params={params} search={search} current={current} />
            ),
          },
        ]
      : [];
  });
}

/** The top bar: the menu button on small screens, the path to the page, then `end` on the right. */
export function Topbar({ onOpenMenu, end }: { onOpenMenu: () => void; end?: ReactNode }) {
  const { t } = useI18n();
  const crumbs = useCrumbs();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:h-16 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 lg:hidden"
          aria-label={t('nav.openMenu')}
          onClick={onOpenMenu}
        >
          <MenuIcon aria-hidden="true" />
        </Button>
        {crumbs.length > 0 ? (
          <nav aria-label={t('nav.breadcrumb')} className="min-w-0">
            <ol className="flex items-center gap-1.5 text-sm">
              {crumbs.map((crumb, index) => (
                <li
                  key={crumb.id}
                  className={`flex items-center gap-1.5 ${index === crumbs.length - 1 || 'own' in crumb ? 'min-w-0' : 'shrink-0'}`}
                >
                  {index > 0 ? <CrumbSeparator /> : null}
                  <CrumbStep crumb={crumb} current={index === crumbs.length - 1} />
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {end ? <div className="ml-auto flex shrink-0 items-center gap-3">{end}</div> : null}
      </div>
    </header>
  );
}

/** One step: its own way of showing itself, the page being shown, or a link to a parent. */
function CrumbStep({ crumb, current }: { crumb: Crumb; current: boolean }) {
  if ('own' in crumb) {
    return crumb.own(current);
  }
  if (current) {
    return (
      <span aria-current="page" className={CRUMB_CURRENT_CLASS}>
        {crumb.label}
      </span>
    );
  }
  // Every step is a parent of this page: the current parameters fill its path.
  return (
    <Link to={crumb.to} params={true} className={CRUMB_LINK_CLASS}>
      {crumb.label}
    </Link>
  );
}

/** The slash between two steps of the path. */
export function CrumbSeparator() {
  return (
    <span aria-hidden="true" className="text-muted-foreground">
      /
    </span>
  );
}
