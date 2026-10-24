import type { IssueActivity, Locale, PaletteColor } from '@toppo/shared';
import { cn, StatusBadge } from '@toppo/ui';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  CircleDotIcon,
  FilePlusIcon,
  FlagIcon,
  ListIcon,
  type LucideIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  PencilIcon,
  SlidersHorizontalIcon,
  TagIcon,
  TagsIcon,
  UserPlusIcon,
  UserXIcon,
} from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { formatDateTime, formatDay } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { formatNumber } from '../../../../shared/i18n/numbers.util.ts';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import type { HistoryEntry } from '../../utils/issue-history.util.ts';
import { PriorityLabel } from '../fields/priority-label.tsx';

type Translate = ReturnType<typeof useI18n>['t'];

/** Each status's color now, by id: the history keeps a status's name, not its color. */
export type StatusColors = ReadonlyMap<string, PaletteColor>;

/** The circle a change shows on the timeline. */
function iconOf(activity: IssueActivity): LucideIcon {
  switch (activity.type) {
    case 'issue.created':
      return FilePlusIcon;
    case 'issue.titleChanged':
    case 'issue.descriptionChanged':
      return PencilIcon;
    case 'issue.categoryChanged':
      return TagIcon;
    case 'issue.priorityChanged':
      return FlagIcon;
    case 'issue.statusChanged':
      return CircleDotIcon;
    case 'issue.assigneeChanged':
      return activity.payload.to ? UserPlusIcon : UserXIcon;
    case 'issue.commented':
      return MessageSquareTextIcon;
    case 'issue.attachmentAdded':
      return PaperclipIcon;
    case 'issue.labelsChanged':
      return TagsIcon;
    case 'issue.propertyChanged':
      return ListIcon;
  }
}

/**
 * One step of the timeline: its circle on the line, who did what, and when. Changes made together
 * read as their count, and unfold one per line on demand.
 */
export function HistoryItem({
  entry,
  statusColors,
}: {
  entry: HistoryEntry;
  statusColors: StatusColors;
}) {
  const { t, locale } = useI18n();
  const single = entry.changes.length === 1 ? entry.changes[0] : undefined;
  const Icon = single ? iconOf(single) : SlidersHorizontalIcon;
  const who = (
    <span className="font-medium text-foreground">
      {entry.actor.name ?? t('issues.deletedUser')}
    </span>
  );
  const when = <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, locale)}</time>;

  return (
    <li className="relative flex gap-3 pb-5 after:absolute after:top-9 after:bottom-1 after:left-4 after:w-px after:-translate-x-1/2 after:bg-border last:pb-0 last:after:hidden">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1.5 text-sm text-muted-foreground">
        {single ? (
          <p>
            {who} {describe(single, t, locale, statusColors)} · {when}
          </p>
        ) : (
          <ChangesTogether entry={entry} statusColors={statusColors} who={who} when={when} />
        )}
      </div>
    </li>
  );
}

/** "Sarah made 2 changes", then each change, field by field, once unfolded. */
function ChangesTogether({
  entry,
  statusColors,
  who,
  when,
}: {
  entry: HistoryEntry;
  statusColors: StatusColors;
  who: ReactNode;
  when: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const count = entry.changes.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p>
          {who} {t(`issues.activity.changes.${pluralForm(locale, count)}`, { count })} · {when}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen(!open)}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:h-11"
        >
          {open ? t('issues.activity.hide') : t('issues.activity.details')}
          <ChevronDownIcon
            aria-hidden="true"
            className={cn('size-3.5 transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>
      <ul
        id={detailsId}
        hidden={!open}
        className="mt-2 flex flex-col gap-1.5 border-l-2 border-border pl-3 text-xs"
      >
        {entry.changes.map((change) => (
          <li key={change.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {field(change, t, locale, statusColors)}
          </li>
        ))}
      </ul>
    </>
  );
}

/** "added the labels Mobile and Billing and removed the label Docs", in the reader's language. */
function labelsChanged(
  { added, removed }: { added: { name: string }[]; removed: { name: string }[] },
  t: Translate,
  locale: Locale,
): string {
  const names = (labels: { name: string }[]) =>
    new Intl.ListFormat(locale, { type: 'conjunction' }).format(labels.map(({ name }) => name));
  const addedText = t(`issues.activity.labelsAdded.${pluralForm(locale, added.length)}`, {
    names: names(added),
  });
  if (removed.length === 0) {
    return addedText;
  }
  const form = pluralForm(locale, removed.length);
  if (added.length === 0) {
    return t(`issues.activity.labelsRemoved.${form}`, { names: names(removed) });
  }
  return t('issues.activity.labelsBoth', {
    added: addedText,
    removed: t(`issues.activity.labelsRemovedToo.${form}`, { names: names(removed) }),
  });
}

/** One change as the words that follow who made it. */
function describe(
  activity: IssueActivity,
  t: Translate,
  locale: Locale,
  statusColors: StatusColors,
): ReactNode {
  switch (activity.type) {
    case 'issue.created':
      return t('issues.activity.created');
    case 'issue.titleChanged':
      return t('issues.activity.titleChanged', { to: activity.payload.to });
    case 'issue.descriptionChanged':
      return t('issues.activity.descriptionChanged');
    case 'issue.categoryChanged':
      return t('issues.activity.categoryChanged', { to: activity.payload.to.name });
    case 'issue.priorityChanged':
      return t('issues.activity.priorityChanged', { to: activity.payload.to.name });
    case 'issue.statusChanged':
      return (
        <>
          {t('issues.activity.statusChanged')}{' '}
          <FromTo
            from={<StatusBadge status={statusOf(activity.payload.from, statusColors)} />}
            to={<StatusBadge status={statusOf(activity.payload.to, statusColors)} />}
            t={t}
          />
        </>
      );
    case 'issue.assigneeChanged':
      return activity.payload.to
        ? t('issues.activity.assigned', {
            name: activity.payload.to.name ?? t('issues.deletedUser'),
          })
        : t('issues.activity.unassigned');
    case 'issue.commented':
      return t('issues.activity.commented');
    case 'issue.attachmentAdded':
      return t('issues.activity.attached', { name: activity.payload.attachment.fileName });
    case 'issue.labelsChanged':
      return labelsChanged(activity.payload, t, locale);
    case 'issue.propertyChanged': {
      const change = activity.payload;
      const property = change.property.name;
      if (change.type === 'checkbox') {
        return change.to
          ? t('issues.activity.propertyTicked', { property })
          : t('issues.activity.propertyUnticked', { property });
      }
      const to = changedValueText(change, 'to', t, locale);
      return to === null
        ? t('issues.activity.propertyCleared', { property })
        : t('issues.activity.propertyChanged', { property, to });
    }
  }
}

type PropertyChange = Extract<IssueActivity, { type: 'issue.propertyChanged' }>['payload'];

/**
 * A property's value before or after a change, in words: options and people by name, a day and
 * a number as the reader writes them; `null` for no value.
 */
function changedValueText(
  change: PropertyChange,
  side: 'from' | 'to',
  t: Translate,
  locale: Locale,
): string | null {
  switch (change.type) {
    case 'list':
      return change[side]?.name ?? null;
    case 'multiSelect':
      return change[side]?.map(({ name }) => name).join(', ') ?? null;
    case 'user': {
      const person = change[side];
      return person ? (person.name ?? t('issues.deletedUser')) : null;
    }
    case 'number': {
      const number = change[side];
      return number === null ? null : formatNumber(number, locale);
    }
    case 'date': {
      const day = change[side];
      return day === null ? null : formatDay(day, locale);
    }
    case 'checkbox':
      return change[side] ? t('issues.checked') : t('issues.unchecked');
    case 'text':
      return change[side];
  }
}

/** One change of several, as its field and where it went: "Priority: Normal → High". */
function field(
  activity: IssueActivity,
  t: Translate,
  locale: Locale,
  statusColors: StatusColors,
): ReactNode {
  const labelled = (label: string, value: ReactNode) => (
    <>
      <span>{t('issues.activity.field', { label })}</span> {value}
    </>
  );
  const strong = (text: string) => (
    <span className="min-w-0 font-medium break-words text-foreground">{text}</span>
  );
  const person = (who: { name: string | null } | null) =>
    who ? (who.name ?? t('issues.deletedUser')) : t('issues.unassigned');

  switch (activity.type) {
    case 'issue.created':
      return t('issues.activity.created');
    case 'issue.titleChanged':
      return labelled(
        t('issues.subject'),
        <FromTo from={activity.payload.from} to={strong(activity.payload.to)} t={t} />,
      );
    case 'issue.descriptionChanged':
      return labelled(t('issues.description'), strong(t('issues.activity.edited')));
    case 'issue.categoryChanged':
      return labelled(
        t('issues.category'),
        <FromTo from={activity.payload.from.name} to={strong(activity.payload.to.name)} t={t} />,
      );
    case 'issue.priorityChanged':
      return labelled(
        t('issues.priority'),
        <FromTo
          from={<PriorityLabel priority={activity.payload.from} />}
          to={<PriorityLabel priority={activity.payload.to} />}
          t={t}
        />,
      );
    case 'issue.statusChanged':
      return labelled(
        t('issues.status'),
        <FromTo
          from={<StatusBadge status={statusOf(activity.payload.from, statusColors)} />}
          to={<StatusBadge status={statusOf(activity.payload.to, statusColors)} />}
          t={t}
        />,
      );
    case 'issue.assigneeChanged':
      return labelled(
        t('issues.assignee'),
        <FromTo
          from={person(activity.payload.from)}
          to={strong(person(activity.payload.to))}
          t={t}
        />,
      );
    // Never grouped with other changes: shown on its own, by `CommentItem`.
    case 'issue.commented':
      return t('issues.activity.commented');
    case 'issue.attachmentAdded':
      return t('issues.activity.attached', { name: activity.payload.attachment.fileName });
    case 'issue.labelsChanged':
      return labelsChanged(activity.payload, t, locale);
    case 'issue.propertyChanged': {
      const change = activity.payload;
      const noValue = t('issues.activity.noValue');
      return labelled(
        change.property.name,
        <FromTo
          from={changedValueText(change, 'from', t, locale) ?? noValue}
          to={strong(changedValueText(change, 'to', t, locale) ?? noValue)}
          t={t}
        />,
      );
    }
  }
}

/** A status as it was named, in the color it has now; gray once it is gone. */
function statusOf(status: { id: string; name: string }, statusColors: StatusColors) {
  return { name: status.name, color: statusColors.get(status.id) ?? 'gray' };
}

/** "Before → after": the arrow is read as a word, the spaces keep the words apart in the text. */
function FromTo({ from, to, t }: { from: ReactNode; to: ReactNode; t: Translate }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 align-middle">
      {from} <ArrowRightIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only">{t('issues.activity.to')}</span> {to}
    </span>
  );
}
