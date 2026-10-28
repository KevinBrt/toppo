import { ATTACHMENTS_MAX } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { formatFileSize } from '../../../../shared/i18n/sizes.util.ts';
import type { FailedUpload } from '../../api/attachments.api.ts';
import { ATTACHMENT_ERRORS } from '../../constants/attachments.constants.ts';
import type { FileDraft, RefusedFile } from '../../models/attachment-draft.model.ts';
import { kindOf, typeLabelOf } from '../../utils/attachment-files.util.ts';
import { AttachmentCard, AttachmentGrid } from './attachment-card.tsx';
import { FilePreview } from './file-preview.tsx';

/** A local address for a chosen image, given back once it is no longer shown. */
function useObjectUrl(file: File, wanted: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!wanted) {
      return;
    }
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file, wanted]);
  return url;
}

function DraftCard({
  draft,
  sending,
  onRemove,
}: {
  draft: FileDraft;
  sending: boolean;
  onRemove: (() => void) | undefined;
}) {
  const kind = kindOf(draft.mediaType);
  const imageUrl = useObjectUrl(draft.file, kind === 'image');

  return (
    <AttachmentCard
      name={draft.file.name}
      size={draft.file.size}
      sending={sending}
      preview={
        <FilePreview kind={kind} typeLabel={typeLabelOf(draft.file.name)} imageUrl={imageUrl} />
      }
      onRemove={sending ? undefined : onRemove}
    />
  );
}

/** Files chosen and not sent yet: images show themselves; each is removable until it is sent. */
export function DraftFiles({
  drafts,
  sending = false,
  onRemove,
}: {
  drafts: readonly FileDraft[];
  sending?: boolean;
  onRemove?: ((id: string) => void) | undefined;
}) {
  const { t } = useI18n();
  if (drafts.length === 0) {
    return null;
  }
  return (
    <AttachmentGrid label={t('issues.attachments.title')}>
      {drafts.map((draft) => (
        <DraftCard
          key={draft.id}
          draft={draft}
          sending={sending}
          onRemove={onRemove ? () => onRemove(draft.id) : undefined}
        />
      ))}
    </AttachmentGrid>
  );
}

/** The files refused before being sent, each with the reason. */
export function RefusedFiles({
  refused,
  maxFileSize,
}: {
  refused: readonly RefusedFile[];
  maxFileSize: number;
}) {
  const { t, locale } = useI18n();
  if (refused.length === 0) {
    return null;
  }
  const reasonOf = ({ problem }: RefusedFile) => {
    switch (problem) {
      case 'size':
        return t('issues.attachments.problems.size', {
          size: formatFileSize(maxFileSize, locale),
        });
      case 'tooMany':
        return t('issues.attachments.problems.tooMany', { max: ATTACHMENTS_MAX });
      default:
        return t(`issues.attachments.problems.${problem}`);
    }
  };
  return (
    <FileProblems
      title={t('issues.attachments.refused')}
      problems={refused.map((file) => ({ id: file.id, name: file.name, reason: reasonOf(file) }))}
    />
  );
}

/** The files the server did not attach, each with its reason; `title` says what happened. */
export function FailedUploads({
  title,
  failed,
  children,
}: {
  title: string;
  failed: readonly FailedUpload[];
  children?: ReactNode;
}) {
  const { t } = useI18n();
  if (failed.length === 0) {
    return null;
  }
  return (
    <FileProblems
      title={title}
      problems={failed.map(({ id, file, error }) => ({
        id,
        name: file.name,
        reason: requestErrorMessage(error, t, ATTACHMENT_ERRORS),
      }))}
    >
      {children}
    </FileProblems>
  );
}

function FileProblems({
  title,
  problems,
  children,
}: {
  title: string;
  problems: readonly { id: string; name: string; reason: string }[];
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Alert tone="danger">
      <p>{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {problems.map(({ id, name, reason }) => (
          <li key={id} className="break-words">
            {t('issues.attachments.failure', { name, reason })}
          </li>
        ))}
      </ul>
      {children}
    </Alert>
  );
}
