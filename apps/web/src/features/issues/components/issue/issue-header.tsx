import {
  ISSUE_TITLE_MAX_LENGTH,
  type IssueFieldsResponse,
  type IssueResponse,
  issueTitleSchema,
} from '@toppo/shared';
import {
  BadgeSelect,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@toppo/ui';
import { CopyIcon, EllipsisIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { formatDateTime } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { IssueEdit } from '../../models/issue-edit.model.ts';
import { DeleteIssueDialog } from './delete-issue-dialog.tsx';
import { FollowButton } from './follow-button.tsx';
import { MarkDuplicateDialog } from './mark-duplicate-dialog.tsx';

/**
 * The issue's title, edited in place, its status, whether one follows it and what else can be
 * done with it.
 */
export function IssueHeader({
  issue,
  fields,
  onEdit,
  onFollow,
  onDeleted,
}: {
  issue: IssueResponse;
  fields: IssueFieldsResponse | undefined;
  onEdit: (edit: IssueEdit) => void;
  onFollow: (following: boolean) => void;
  onDeleted: () => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [marking, setMarking] = useState(false);
  const canEditTitle = issue.actions.includes('editText');
  // Marking a duplicate closes it: whoever may change its status may. A duplicate already
  // loses its mark first, from its notice.
  const canMark = issue.actions.includes('changeStatus') && issue.duplicateOf === null;
  const canDelete = issue.actions.includes('delete');
  const reporter = issue.reporter.name ?? t('issues.deletedUser');

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {editing ? (
          <TitleForm
            title={issue.title}
            onSave={(title) => {
              setEditing(false);
              if (title !== issue.title) {
                onEdit({ field: 'title', title });
              }
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex items-start gap-2">
            <h1 className="min-w-0 text-xl font-semibold tracking-tight break-words text-foreground sm:text-2xl">
              {issue.title}
            </h1>
            {canEditTitle ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('issues.editTitle')}
                onClick={() => setEditing(true)}
                className="shrink-0"
              >
                <PencilIcon aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {t('issues.openedBy', { name: reporter, date: formatDateTime(issue.createdAt, locale) })}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <StatusMenu issue={issue} fields={fields} onEdit={onEdit} />
        {issue.actions.includes('follow') ? (
          <FollowButton following={issue.following} onFollow={onFollow} />
        ) : null}
        {canMark || canDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label={t('issues.more')}>
                <EllipsisIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canMark ? (
                <DropdownMenuItem onSelect={() => setMarking(true)}>
                  <CopyIcon aria-hidden="true" />
                  {t('issues.duplicate.mark')}
                </DropdownMenuItem>
              ) : null}
              {canDelete ? (
                <DropdownMenuItem tone="danger" onSelect={() => setDeleting(true)}>
                  <Trash2Icon aria-hidden="true" />
                  {t('issues.delete')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {canMark ? (
          <MarkDuplicateDialog
            issue={issue}
            statuses={fields?.statuses}
            open={marking}
            onOpenChange={setMarking}
          />
        ) : null}
        {canDelete ? (
          <DeleteIssueDialog
            issue={issue}
            open={deleting}
            onOpenChange={setDeleting}
            onDeleted={onDeleted}
          />
        ) : null}
      </div>
    </header>
  );
}

/** The status, opening the statuses the workflow allows next: only those. */
export function StatusMenu({
  issue,
  fields,
  onEdit,
}: {
  issue: IssueResponse;
  fields: IssueFieldsResponse | undefined;
  onEdit: (edit: IssueEdit) => void;
}) {
  const { t } = useI18n();
  const statuses = fields?.statuses ?? [];
  const next = statuses.find(({ id }) => id === issue.status.id)?.next ?? [];
  const reachable = [issue.status, ...statuses.filter(({ id }) => next.includes(id))];

  return (
    <BadgeSelect
      aria-label={t('issues.status')}
      disabled={!issue.actions.includes('changeStatus') || next.length === 0}
      options={reachable.map((status) => ({
        value: status.id,
        label: status.name,
        tone: status.color,
      }))}
      value={issue.status.id}
      onValueChange={(statusId) => {
        const status = statuses.find(({ id }) => id === statusId);
        if (status) {
          const { id, name, color, closes } = status;
          onEdit({ field: 'status', status: { id, name, color, closes } });
        }
      }}
    />
  );
}

/** The title in a field: Enter saves, Escape leaves it as it was. */
function TitleForm({
  title,
  onSave,
  onCancel,
}: {
  title: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(title);
  const valid = issueTitleSchema.safeParse(value);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid.success) {
      onSave(valid.data);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        aria-label={t('issues.subject')}
        // The person asked to edit the title: it gets the focus.
        ref={(element) => element?.focus()}
        value={value}
        maxLength={ISSUE_TITLE_MAX_LENGTH}
        aria-invalid={!valid.success}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
        className="text-lg font-semibold"
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={!valid.success}>
          {t('issues.save')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('issues.cancel')}
        </Button>
      </div>
    </form>
  );
}
