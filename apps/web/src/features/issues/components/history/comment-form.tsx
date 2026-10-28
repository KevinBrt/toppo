import { useMutation, useQuery } from '@tanstack/react-query';
import { ATTACHMENTS_MAX, COMMENT_BODY_MAX_LENGTH, type UserRef } from '@toppo-tracker/shared';
import { Alert, Button, cn } from '@toppo-tracker/ui';
import { SendIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Attachments, type FailedUpload } from '../../api/attachments.api.ts';
import { Comments } from '../../api/comments.api.ts';
import { COMMENT_ERRORS } from '../../constants/comments.constants.ts';
import type { FileDraft, RefusedFile } from '../../models/attachment-draft.model.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { chooseFiles } from '../../utils/attachment-files.util.ts';
import { AttachButton, useFileDrop } from '../attachments/attach-button.tsx';
import { DraftFiles, FailedUploads, RefusedFiles } from '../attachments/draft-files.tsx';
import { useMentions } from './mention-list.tsx';

/**
 * The way to comment, above the history: plain text in a card, addressed to whoever reported
 * the issue, naming people with `@`, files joined to it by the paperclip or dropped on the card,
 * and one button to send it all. Reports the comment once sent, and empties itself.
 */
export function CommentForm({
  issueKey,
  replyTo,
  onCommented,
}: {
  issueKey: string;
  /** Whom the comment answers: the reporter, unless it is the reader. */
  replyTo: UserRef | null;
  onCommented: () => Promise<void>;
}) {
  const { t } = useI18n();
  const fieldId = useId();
  const [body, setBody] = useState('');
  const [drafts, setDrafts] = useState<FileDraft[]>([]);
  const [refused, setRefused] = useState<RefusedFile[]>([]);
  const [failed, setFailed] = useState<FailedUpload[]>([]);
  const limits = useQuery(IssuesQueries.attachmentLimits);
  const mentions = useMentions({ issueKey, value: body, onChange: setBody });
  const add = useMutation({
    mutationFn: async ({ text, files }: { text: string; files: readonly FileDraft[] }) => {
      const commentId = await Comments.add(issueKey, text, mentions.mentions(text));
      return await Attachments.addAll(issueKey, files, { commentId });
    },
    onSuccess: async (failures) => {
      setBody('');
      mentions.reset();
      setDrafts([]);
      setFailed(failures);
      await onCommented();
    },
  });
  const choose = (picked: File[]) => {
    if (!limits.data || add.isPending) {
      return;
    }
    const chosen = chooseFiles(picked, {
      maxFileSize: limits.data.maxFileSize,
      room: ATTACHMENTS_MAX - drafts.length,
    });
    setRefused(chosen.refused);
    setFailed([]);
    setDrafts([...drafts, ...chosen.drafts]);
  };
  const drop = useFileDrop(choose, limits.data !== undefined && !add.isPending);
  const firstName = replyTo?.name?.split(' ')[0];

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim() !== '') {
          add.mutate({ text: body, files: drafts });
        }
      }}
      className="flex flex-col gap-3"
    >
      {add.isError ? (
        <Alert tone="danger">{requestErrorMessage(add.error, t, COMMENT_ERRORS)}</Alert>
      ) : null}
      <FailedUploads title={t('issues.attachments.commentedWithout')} failed={failed} />
      <RefusedFiles refused={refused} maxFileSize={limits.data?.maxFileSize ?? 0} />
      <div
        {...drop.handlers}
        className={cn(
          'rounded-xl border border-border bg-surface shadow-xs transition-colors has-[textarea:focus-visible]:border-primary has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-ring/30',
          drop.over && 'border-primary bg-primary-subtle',
        )}
      >
        <label htmlFor={fieldId} className="sr-only">
          {t('issues.comments.add')}
        </label>
        <div className="relative">
          <textarea
            id={fieldId}
            value={body}
            rows={3}
            maxLength={COMMENT_BODY_MAX_LENGTH}
            placeholder={
              firstName
                ? t('issues.comments.replyTo', { name: firstName })
                : t('issues.comments.placeholder')
            }
            {...mentions.field}
            className="block min-h-20 w-full resize-y rounded-t-xl bg-transparent px-4 pt-3 pb-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground pointer-coarse:text-base"
          />
          {mentions.list}
        </div>
        {drafts.length > 0 ? (
          <div className="px-3 pb-3">
            <DraftFiles
              drafts={drafts}
              sending={add.isPending}
              onRemove={(id) => setDrafts(drafts.filter((draft) => draft.id !== id))}
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <AttachButton
            label={t('issues.attachments.attach')}
            iconOnly
            disabled={!limits.data || add.isPending || drafts.length >= ATTACHMENTS_MAX}
            onFiles={choose}
          />
          <Button type="submit" disabled={body.trim() === '' || add.isPending}>
            <SendIcon aria-hidden="true" />
            {add.isPending ? t('issues.comments.sending') : t('issues.comments.send')}
          </Button>
        </div>
      </div>
    </form>
  );
}
