import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n-provider.tsx';
import type { AddedNavSection, NavSection } from './navigation.constants.ts';

/**
 * A part of the app with its own navigation, like the settings or a project's: a column beside
 * the page on wide screens, a row of links above it on smaller ones. Links keep the current path
 * parameters, so a project's sections stay in that project.
 */
const LINK_CLASS =
  'flex min-h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground pointer-coarse:min-h-11 data-[status=active]:bg-primary-subtle data-[status=active]:text-primary-subtle-foreground';

export function SectionLayout({
  label,
  header,
  sections,
  addedSections = [],
  children,
}: {
  /** Accessible name of the navigation. */
  label: string;
  /** Shown above the links in the column, e.g. what the section is about; hidden on small screens. */
  header?: ReactNode;
  sections: readonly NavSection[];
  /** Entries after the part's own: plugins' pages. */
  addedSections?: readonly AddedNavSection[];
  children: ReactNode;
}) {
  const { t } = useI18n();

  if (sections.length === 0 && addedSections.length === 0) {
    return children;
  }
  return (
    // From lg up, the column reaches past the page padding, from the top bar to the bottom
    // (lg:h-16 bar): a white panel against the app sidebar, as in the mockups.
    <div className="flex flex-col gap-5 lg:-my-8 lg:-ml-8 lg:min-h-[calc(100dvh-4rem)] lg:flex-row lg:gap-0">
      <nav
        aria-label={label}
        className="lg:w-56 lg:shrink-0 lg:border-r lg:border-border lg:bg-surface lg:px-3 lg:py-6"
      >
        <div className="lg:sticky lg:top-22">
          {header ? <div className="hidden lg:mb-5 lg:block">{header}</div> : null}
          {sections.map((section) => (
            <div key={section.labelKey ?? 'main'} className="lg:mb-5">
              {section.labelKey ? (
                <p className="hidden px-3 pb-2 text-xs font-medium text-muted-foreground lg:block">
                  {t(section.labelKey)}
                </p>
              ) : null}
              <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
                {section.items.map(({ to, labelKey, exact }) => (
                  <li key={to} className="shrink-0">
                    <Link
                      to={to}
                      params={true}
                      activeOptions={{ exact: exact === true }}
                      className={LINK_CLASS}
                    >
                      {t(labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {addedSections.map((section) => (
            <div key={section.key} className="lg:mb-5">
              <p className="hidden px-3 pb-2 text-xs font-medium text-muted-foreground lg:block">
                {section.label}
              </p>
              <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
                {section.items.map(({ key, label: entry, to, params }) => (
                  <li key={key} className="shrink-0">
                    <Link to={to} params={params} className={LINK_CLASS}>
                      {entry}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1 lg:py-8 lg:pl-8">{children}</div>
    </div>
  );
}
