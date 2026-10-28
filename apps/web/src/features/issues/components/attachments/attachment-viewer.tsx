import { useQuery } from '@tanstack/react-query';
import { isImage } from '@toppo-tracker/core';
import type { IssueAttachment } from '@toppo-tracker/shared';
import { Alert, Button, buttonVariants, Dialog, DialogContent } from '@toppo-tracker/ui';
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { formatFileSize } from '../../../../shared/i18n/sizes.util.ts';
import { Attachments } from '../../api/attachments.api.ts';
import { ATTACHMENT_ERRORS, TEXT_SHOWN_MAX_SIZE } from '../../constants/attachments.constants.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';

/**
 * A text file's words, as written: a read-only box, never interpreted, that the keyboard focuses
 * and scrolls, and that lets its words be selected and copied.
 */
function TextContent({ issueKey, file }: { issueKey: string; file: IssueAttachment }) {
  const { t } = useI18n();
  const tooLarge = file.size > TEXT_SHOWN_MAX_SIZE;
  const text = useQuery({
    ...IssuesQueries.attachmentText(issueKey, file.id),
    enabled: !tooLarge,
  });

  if (tooLarge) {
    return <Alert>{t('issues.attachments.textTooLarge')}</Alert>;
  }
  if (text.isError) {
    return <Alert tone="danger">{requestErrorMessage(text.error, t, ATTACHMENT_ERRORS)}</Alert>;
  }
  if (text.data === undefined) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('issues.attachments.textLoading')}
      </p>
    );
  }
  return (
    <textarea
      readOnly
      value={text.data}
      aria-label={t('issues.attachments.textContent', { name: file.fileName })}
      className="h-[65dvh] w-full resize-none rounded-lg border border-border bg-surface-muted p-4 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    />
  );
}

/**
 * The files of a list that the app shows itself, one at a time in a dialog: an image as large
 * as it fits, a text as written. The arrows, or the arrow keys, go from one to the next; each
 * one downloads, and an image opens alone in a tab.
 */
export function AttachmentViewer({
  issueKey,
  files,
  index,
  onIndex,
  onClose,
}: {
  issueKey: string;
  files: readonly IssueAttachment[];
  /** The file shown; none while the viewer is closed. */
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const file = index === null ? undefined : files[index];
  const go = (step: number) => {
    if (index !== null) {
      onIndex((index + step + files.length) % files.length);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    // Inside the text, the arrows move through it.
    if (event.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      go(-1);
    } else if (event.key === 'ArrowRight') {
      go(1);
    }
  };

  return (
    <Dialog
      open={file !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      {file ? (
        <DialogContent
          title={file.fileName}
          description={formatFileSize(file.size, locale)}
          closeLabel={t('issues.close')}
          onKeyDown={onKeyDown}
          className="max-w-5xl [overflow-wrap:anywhere]"
        >
          <div className="flex flex-col gap-4">
            {isImage(file.mediaType) ? (
              <img
                src={Attachments.previewUrl(issueKey, file.id)}
                alt={file.fileName}
                className="mx-auto max-h-[65dvh] max-w-full rounded-md object-contain"
              />
            ) : (
              <TextContent issueKey={issueKey} file={file} />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {files.length > 1 && index !== null ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t('issues.attachments.previous')}
                    onClick={() => go(-1)}
                  >
                    <ChevronLeftIcon aria-hidden="true" />
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {t('issues.attachments.position', { index: index + 1, count: files.length })}
                  </span>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t('issues.attachments.next')}
                    onClick={() => go(1)}
                  >
                    <ChevronRightIcon aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap gap-2">
                {isImage(file.mediaType) ? (
                  <a
                    href={Attachments.previewUrl(issueKey, file.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: 'secondary' })}
                  >
                    <ExternalLinkIcon aria-hidden="true" />
                    {t('issues.attachments.openInTab')}
                  </a>
                ) : null}
                <a
                  href={Attachments.downloadUrl(issueKey, file.id)}
                  download={file.fileName}
                  className={buttonVariants({ variant: 'primary' })}
                >
                  <DownloadIcon aria-hidden="true" />
                  {t('issues.attachments.download')}
                </a>
              </div>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
