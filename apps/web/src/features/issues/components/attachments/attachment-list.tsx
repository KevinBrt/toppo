import { isImage } from '@toppo-tracker/core';
import type { IssueAttachment } from '@toppo-tracker/shared';
import { useState } from 'react';
import { Attachments } from '../../api/attachments.api.ts';
import { kindOf, typeLabelOf, viewOf } from '../../utils/attachment-files.util.ts';
import { AttachmentCard, AttachmentGrid, type CardAction } from './attachment-card.tsx';
import { AttachmentViewer } from './attachment-viewer.tsx';
import { FilePreview } from './file-preview.tsx';
import { RemoveAttachmentDialog } from './remove-attachment-dialog.tsx';

/**
 * Files attached, as cards, images showing themselves. Choosing one shows it in the app (images,
 * text), opens it in a tab (PDF) or downloads it; each one downloads by its icon. Whoever may
 * remove one is asked first; the removal is reported.
 */
export function AttachmentList({
  issueKey,
  attachments,
  label,
  onRemoved,
}: {
  issueKey: string;
  attachments: readonly IssueAttachment[];
  label: string;
  onRemoved: () => Promise<void>;
}) {
  const [removing, setRemoving] = useState<IssueAttachment | null>(null);
  const shown = attachments.filter(({ mediaType }) => viewOf(mediaType) === 'app');
  const [viewing, setViewing] = useState<number | null>(null);
  const actionOf = (attachment: IssueAttachment): CardAction => {
    switch (viewOf(attachment.mediaType)) {
      case 'app':
        return { kind: 'view', onView: () => setViewing(shown.indexOf(attachment)) };
      case 'tab':
        return { kind: 'open', href: Attachments.previewUrl(issueKey, attachment.id) };
      case 'download':
        return { kind: 'download', href: Attachments.downloadUrl(issueKey, attachment.id) };
    }
  };

  return (
    <>
      <AttachmentGrid label={label}>
        {attachments.map((attachment) => (
          <AttachmentCard
            key={attachment.id}
            name={attachment.fileName}
            size={attachment.size}
            action={actionOf(attachment)}
            downloadHref={Attachments.downloadUrl(issueKey, attachment.id)}
            preview={
              <FilePreview
                kind={kindOf(attachment.mediaType)}
                typeLabel={typeLabelOf(attachment.fileName)}
                imageUrl={
                  isImage(attachment.mediaType)
                    ? Attachments.previewUrl(issueKey, attachment.id)
                    : null
                }
              />
            }
            onRemove={
              attachment.actions.includes('delete') ? () => setRemoving(attachment) : undefined
            }
          />
        ))}
      </AttachmentGrid>
      <AttachmentViewer
        issueKey={issueKey}
        files={shown}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
      />
      <RemoveAttachmentDialog
        issueKey={issueKey}
        attachment={removing}
        onClose={() => setRemoving(null)}
        onRemoved={onRemoved}
      />
    </>
  );
}
