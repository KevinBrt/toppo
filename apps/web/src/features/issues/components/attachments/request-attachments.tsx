import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ATTACHMENTS_MAX } from '@toppo-tracker/shared';
import { Alert, cn } from '@toppo-tracker/ui';
import { useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { Attachments, type FailedUpload } from '../../api/attachments.api.ts';
import type { FileDraft, RefusedFile } from '../../models/attachment-draft.model.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { chooseFiles } from '../../utils/attachment-files.util.ts';
import { AttachButton, useFileDrop } from './attach-button.tsx';
import { AttachmentList } from './attachment-list.tsx';
import { DraftFiles, FailedUploads, RefusedFiles } from './draft-files.tsx';

/**
 * The files of an issue's request, under its words: each one downloads. Whoever may attach files
 * adds some with the button or by dropping them here; they are sent at once, one after the other.
 */
export function RequestAttachments({
  issueKey,
  canAttach,
}: {
  issueKey: string;
  canAttach: boolean;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const files = useQuery(IssuesQueries.attachments(issueKey));
  const limits = useQuery({ ...IssuesQueries.attachmentLimits, enabled: canAttach });
  const [drafts, setDrafts] = useState<FileDraft[]>([]);
  const [refused, setRefused] = useState<RefusedFile[]>([]);
  const [failed, setFailed] = useState<FailedUpload[]>([]);
  // A file counts as a change: the issue's history and last change move with it.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: IssuesQueries.attachments(issueKey).queryKey }),
      queryClient.invalidateQueries({ queryKey: ['issues', 'activities', issueKey] }),
      queryClient.invalidateQueries({ queryKey: IssuesQueries.detail(issueKey).queryKey }),
    ]);
  const send = useMutation({
    mutationFn: (chosen: readonly FileDraft[]) => Attachments.addAll(issueKey, chosen),
    onSuccess: async (failures) => {
      setFailed(failures);
      await refresh();
    },
    // Once the list shows them, or whatever went wrong.
    onSettled: () => setDrafts([]),
  });
  const attached = files.data?.rows ?? [];
  const ready = canAttach && limits.data !== undefined && !send.isPending;
  const choose = (picked: File[]) => {
    if (!(ready && limits.data)) {
      return;
    }
    const chosen = chooseFiles(picked, {
      maxFileSize: limits.data.maxFileSize,
      room: ATTACHMENTS_MAX - attached.length,
    });
    setRefused(chosen.refused);
    setFailed([]);
    if (chosen.drafts.length > 0) {
      setDrafts(chosen.drafts);
      send.mutate(chosen.drafts);
    }
  };
  const drop = useFileDrop(choose, ready);
  const count = attached.length;

  if (count === 0 && !canAttach && !files.isError) {
    return null;
  }
  return (
    <div
      {...drop.handlers}
      className={cn(
        'mt-5 flex flex-col gap-3 rounded-lg transition-colors',
        drop.over && 'bg-primary-subtle outline-2 outline-offset-4 outline-primary outline-dashed',
      )}
    >
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {count > 0
            ? t(`issues.attachments.count.${pluralForm(locale, count)}`, { count })
            : t('issues.attachments.title')}
        </p>
        {canAttach ? (
          <AttachButton
            label={t('issues.attachments.attach')}
            disabled={!ready || count >= ATTACHMENTS_MAX}
            onFiles={choose}
          />
        ) : null}
      </div>
      {files.isError ? <Alert tone="danger">{requestErrorMessage(files.error, t)}</Alert> : null}
      <RefusedFiles refused={refused} maxFileSize={limits.data?.maxFileSize ?? 0} />
      <FailedUploads title={t('issues.attachments.notAttached')} failed={failed} />
      {count > 0 ? (
        <AttachmentList
          issueKey={issueKey}
          attachments={attached}
          label={t('issues.attachments.title')}
          onRemoved={async () => {
            await refresh();
          }}
        />
      ) : null}
      <DraftFiles drafts={drafts} sending={send.isPending} />
    </div>
  );
}
