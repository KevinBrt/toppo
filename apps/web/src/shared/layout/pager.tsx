import { Button } from '@toppo-tracker/ui';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useI18n } from '../i18n/i18n-provider.tsx';

/**
 * The foot of a list the server pages: "12 members shown", or the range shown and the way to
 * the other pages when there are several.
 */
export function Pager({
  page,
  pageSize,
  matching,
  shown,
  label,
  onPage,
}: {
  page: number;
  pageSize: number;
  /** Rows matching the filters, across all pages. */
  matching: number;
  /** Rows on this page. */
  shown: number;
  /** "12 members shown", for a list that fits on one page. */
  label: (count: number) => string;
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  if (matching <= pageSize && page === 1) {
    return (
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {label(matching)}
      </p>
    );
  }
  const from = shown === 0 ? 0 : (page - 1) * pageSize + 1;
  return (
    <nav
      aria-label={t('pager.label')}
      className="flex items-center justify-between gap-3 border-t border-border px-4 py-2"
    >
      <p className="text-xs text-muted-foreground">
        {t('pager.range', { from, to: from + shown - (shown === 0 ? 0 : 1), total: matching })}
      </p>
      <div className="flex gap-1">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeftIcon aria-hidden="true" />
          {t('pager.previous')}
        </Button>
        <Button
          variant="ghost"
          disabled={page * pageSize >= matching}
          onClick={() => onPage(page + 1)}
        >
          {t('pager.next')}
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
