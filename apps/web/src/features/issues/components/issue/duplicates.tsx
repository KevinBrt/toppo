import { Link } from '@tanstack/react-router';
import type { IssueResponse } from '@toppo/shared';
import { Button } from '@toppo/ui';
import { ArrowRightIcon, CopyIcon } from 'lucide-react';
import { useId } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { StatusLabel } from '../fields/status-label.tsx';

/**
 * At the top of a duplicate: that it is one, the issue it repeats as a card leading to it (as the
 * reader may know it), and the way to take the mark off for who may.
 */
export function DuplicateNotice({
  duplicateOf,
  canUnmark,
  onUnmark,
}: {
  duplicateOf: NonNullable<IssueResponse['duplicateOf']>;
  canUnmark: boolean;
  onUnmark: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary-subtle p-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <CopyIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 id={titleId} className="text-sm font-semibold text-primary-subtle-foreground">
            {t('issues.duplicate.notice')}
          </h2>
          {duplicateOf.key ? (
            <Link
              to="/issues/$issueKey"
              params={{ issueKey: duplicateOf.key }}
              className="group flex max-w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-xs outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="font-mono text-xs font-medium text-muted-foreground">
                {duplicateOf.key}
              </span>
              <span className="min-w-0 font-medium break-words text-foreground group-hover:underline">
                {duplicateOf.title}
              </span>
              {duplicateOf.status ? <StatusLabel status={duplicateOf.status} /> : null}
              <ArrowRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            </Link>
          ) : (
            <p className="text-sm text-primary-subtle-foreground">
              {t('issues.duplicate.ofHidden')}
            </p>
          )}
        </div>
      </div>
      {canUnmark ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onUnmark}
          // Under the words on phones, beside them from there.
          className="ml-13 self-start sm:ml-0 sm:self-center"
        >
          {t('issues.duplicate.unmark')}
        </Button>
      ) : null}
    </section>
  );
}

/** Beside an original, under its properties: the issues marked as its duplicates the reader sees. */
export function DuplicateList({ issue }: { issue: IssueResponse }) {
  const { t, locale } = useI18n();
  const headingId = useId();
  const more = issue.duplicateCount - issue.duplicates.length;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-border bg-surface p-5 shadow-xs"
    >
      <h2
        id={headingId}
        className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground"
      >
        <CopyIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        {t(`issues.duplicate.list.${pluralForm(locale, issue.duplicateCount)}`, {
          count: issue.duplicateCount,
        })}
      </h2>
      <ul className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
        {issue.duplicates.map((duplicate) => (
          <li key={duplicate.key}>
            <Link
              to="/issues/$issueKey"
              params={{ issueKey: duplicate.key }}
              className="flex flex-col gap-1 rounded-lg px-2 py-2 outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  {duplicate.key}
                </span>
                <StatusLabel status={duplicate.status} />
              </span>
              <span className="line-clamp-2 text-sm break-words text-foreground">
                {duplicate.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t(`issues.duplicate.more.${pluralForm(locale, more)}`, { count: more })}
        </p>
      ) : null}
    </section>
  );
}
