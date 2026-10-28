import { useMutation } from '@tanstack/react-query';
import { COMMENT_BODY_MAX_LENGTH, type IssueActivity } from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Textarea,
} from '@toppo-tracker/ui';
import { EllipsisIcon, MessageSquareTextIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { Fragment, useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { formatDateTime } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Comments } from '../../api/comments.api.ts';
import { COMMENT_ERRORS } from '../../constants/comments.constants.ts';
import { mentionParts } from '../../utils/mentions.util.ts';
import { AttachmentList } from '../attachments/attachment-list.tsx';
import { DeleteCommentDialog } from './delete-comment-dialog.tsx';
import { useMentions } from './mention-list.tsx';

type CommentActivity = Extract<IssueActivity, { type: 'issue.commented' }>;

/**
 * A comment on the timeline: who wrote it and when, its words as written, its files, and what the
 * reader may do on it, its author editing it in place.
 */
export function CommentItem({
  issueKey,
  activity,
  onChanged,
}: {
  issueKey: string;
  activity: CommentActivity;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const { comment } = activity.payload;
  const author = activity.actor.name ?? t('issues.deletedUser');
  const [draft, setDraft] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <li className="relative flex gap-3 pb-5 after:absolute after:top-9 after:bottom-1 after:left-4 after:w-px after:-translate-x-1/2 after:bg-border last:pb-0 last:after:hidden">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground"
      >
        <MessageSquareTextIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-8 items-center justify-between gap-2">
          <p className="min-w-0 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{author}</span>{' '}
            {t('issues.activity.commented')} ·{' '}
            <time dateTime={activity.createdAt}>{formatDateTime(activity.createdAt, locale)}</time>
            {comment.editedAt ? (
              <>
                {' · '}
                <span
                  title={t('issues.comments.editedOn', {
                    date: formatDateTime(comment.editedAt, locale),
                  })}
                >
                  {t('issues.comments.edited')}
                </span>
              </>
            ) : null}
          </p>
          {comment.actions.length > 0 && draft === null ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('issues.comments.more', { name: author })}
                  className="-my-1 size-8 shrink-0"
                >
                  <EllipsisIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {comment.actions.includes('edit') ? (
                  <DropdownMenuItem onSelect={() => setDraft(comment.body)}>
                    <PencilIcon aria-hidden="true" />
                    {t('issues.comments.edit')}
                  </DropdownMenuItem>
                ) : null}
                {comment.actions.includes('delete') ? (
                  <DropdownMenuItem tone="danger" onSelect={() => setDeleting(true)}>
                    <Trash2Icon aria-hidden="true" />
                    {t('issues.comments.delete')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <div className="mt-1 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs">
          {draft === null ? (
            // Plain text, as written: its line breaks kept, nothing interpreted but the people
            // it names, set apart.
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">
              {mentionParts(
                comment.body,
                comment.mentions.flatMap(({ name }) => (name ? [name] : [])),
              ).map((part) =>
                part.mention ? (
                  <span
                    key={part.at}
                    className="rounded bg-primary-subtle px-1 py-px font-medium text-primary-subtle-foreground"
                  >
                    {part.text}
                  </span>
                ) : (
                  <Fragment key={part.at}>{part.text}</Fragment>
                ),
              )}
            </p>
          ) : (
            <EditComment
              issueKey={issueKey}
              commentId={comment.id}
              draft={draft}
              onDraft={setDraft}
              onDone={async (changed) => {
                setDraft(null);
                if (changed) {
                  await onChanged();
                }
              }}
            />
          )}
          {comment.attachments.length > 0 ? (
            <div className="mt-3">
              <AttachmentList
                issueKey={issueKey}
                attachments={comment.attachments}
                label={t('issues.attachments.title')}
                onRemoved={onChanged}
              />
            </div>
          ) : null}
        </div>
      </div>
      <DeleteCommentDialog
        issueKey={issueKey}
        commentId={comment.id}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={onChanged}
      />
    </li>
  );
}

/** A comment's words, changed in place, naming people with `@`, saved or let go. */
function EditComment({
  issueKey,
  commentId,
  draft,
  onDraft,
  onDone,
}: {
  issueKey: string;
  commentId: string;
  draft: string;
  onDraft: (draft: string) => void;
  onDone: (changed: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const fieldId = useId();
  const mentions = useMentions({ issueKey, value: draft, onChange: onDraft });
  const edit = useMutation({
    mutationFn: (body: string) => Comments.edit(issueKey, commentId, body, mentions.mentions(body)),
    onSuccess: () => onDone(true),
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() !== '') {
          edit.mutate(draft);
        }
      }}
      className="flex flex-col gap-3"
    >
      {edit.isError ? (
        <Alert tone="danger">{requestErrorMessage(edit.error, t, COMMENT_ERRORS)}</Alert>
      ) : null}
      <label htmlFor={fieldId} className="sr-only">
        {t('issues.comments.editLabel')}
      </label>
      <div className="relative">
        <Textarea
          id={fieldId}
          value={draft}
          rows={3}
          maxLength={COMMENT_BODY_MAX_LENGTH}
          {...mentions.field}
          className="min-h-20 resize-y"
        />
        {mentions.list}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onDone(false)}>
          {t('issues.cancel')}
        </Button>
        <Button type="submit" disabled={draft.trim() === '' || edit.isPending}>
          {t('issues.save')}
        </Button>
      </div>
    </form>
  );
}
