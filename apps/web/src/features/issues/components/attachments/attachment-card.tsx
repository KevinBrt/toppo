import { cn } from '@toppo-tracker/ui';
import { DownloadIcon, LoaderCircleIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { formatFileSize } from '../../../../shared/i18n/sizes.util.ts';

/** Files side by side: two on a phone, as many as fit wider. */
export function AttachmentGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"
    >
      {children}
    </ul>
  );
}

/** What choosing a file does: show it in the app, open it in a tab, or download it. */
export type CardAction =
  | { kind: 'view'; onView: () => void }
  | { kind: 'open'; href: string }
  | { kind: 'download'; href: string };

const ACTION_LABELS = {
  view: 'issues.attachments.view',
  open: 'issues.attachments.open',
  download: 'issues.attachments.download',
} as const;

const ACTION_CLASS =
  'block w-full overflow-hidden rounded-lg text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * A file as a card: its preview above its name and size. Choosing it does what `action` says;
 * the download icon always downloads it. It says so while it is being sent, and offers to remove
 * it when `onRemove` is given.
 */
export function AttachmentCard({
  name,
  size,
  preview,
  action,
  downloadHref,
  sending = false,
  onRemove,
}: {
  name: string;
  /** In bytes. */
  size: number;
  preview: ReactNode;
  /** None while it is not attached yet. */
  action?: CardAction | undefined;
  /** Where it downloads from, when choosing it does something else. */
  downloadHref?: string | undefined;
  sending?: boolean;
  onRemove?: (() => void) | undefined;
}) {
  const { t, locale } = useI18n();
  const sizeLabel = formatFileSize(size, locale);
  const separateDownload = action !== undefined && action.kind !== 'download' && downloadHref;
  const body = (
    <>
      {preview}
      <div className={cn('flex items-center gap-2 px-3 py-2.5', separateDownload && 'pr-12')}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={name}>
            {/* The action is named by what the card shows, and says what it does. */}
            {action ? <span className="sr-only">{t(ACTION_LABELS[action.kind])} </span> : null}
            {name}
          </p>
          <p className="text-xs text-muted-foreground">
            {sending ? t('issues.attachments.sending') : sizeLabel}
            {action?.kind === 'open' ? (
              <span className="sr-only"> {t('issues.attachments.newTab')}</span>
            ) : null}
          </p>
        </div>
        {action?.kind === 'download' ? (
          <DownloadIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        {sending ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin"
          />
        ) : null}
      </div>
    </>
  );

  return (
    <li className="relative min-w-0 rounded-lg border border-border bg-surface shadow-xs">
      <CardMain action={action} name={name} sending={sending}>
        {body}
      </CardMain>
      {separateDownload ? (
        <a
          href={downloadHref}
          download={name}
          aria-label={t('issues.attachments.downloadNamed', { name })}
          className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
        >
          <DownloadIcon aria-hidden="true" className="size-4" />
        </a>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={t('issues.attachments.remove', { name })}
          onClick={onRemove}
          className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-xs transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </li>
  );
}

/** The card's own element: what its action needs, or nothing to choose while it is sent. */
function CardMain({
  action,
  name,
  sending,
  children,
}: {
  action: CardAction | undefined;
  name: string;
  sending: boolean;
  children: ReactNode;
}) {
  switch (action?.kind) {
    case 'view':
      return (
        <button type="button" onClick={action.onView} className={ACTION_CLASS}>
          {children}
        </button>
      );
    case 'open':
      return (
        <a href={action.href} target="_blank" rel="noopener noreferrer" className={ACTION_CLASS}>
          {children}
        </a>
      );
    case 'download':
      return (
        <a href={action.href} download={name} className={ACTION_CLASS}>
          {children}
        </a>
      );
    default:
      return (
        <div className={cn('overflow-hidden rounded-lg', sending && 'opacity-75')}>{children}</div>
      );
  }
}
