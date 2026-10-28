import {
  ISSUE_DESCRIPTION_MAX_LENGTH,
  type IssueResponse,
  issueDescriptionSchema,
} from '@toppo-tracker/shared';
import { Button, Field } from '@toppo-tracker/ui';
import { PencilIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { formatDateTime } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { IssueEdit } from '../../models/issue-edit.model.ts';
import { RequestAttachments } from '../attachments/request-attachments.tsx';
import { PersonName } from '../fields/person-name.tsx';
import { MarkdownEditor } from '../markdown/markdown-editor.tsx';
import { MarkdownText } from '../markdown/markdown-text.tsx';

/** The description, or a word saying there is none. */
function RequestText({ description }: { description: string }) {
  const { t } = useI18n();

  if (!description) {
    return <p className="text-sm text-muted-foreground italic">{t('issues.noDescription')}</p>;
  }
  return <MarkdownText>{description}</MarkdownText>;
}

/** What the reporter asked: the description, rendered from Markdown, edited in place, and its files. */
export function IssueRequest({
  issue,
  onEdit,
}: {
  issue: IssueResponse;
  onEdit: (edit: IssueEdit) => void;
}) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [tooLong, setTooLong] = useState(false);
  const canEdit = issue.actions.includes('editText');

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          {t('issues.request')}
        </h2>
        {canEdit && draft === null ? (
          <Button variant="ghost" size="sm" onClick={() => setDraft(issue.description)}>
            <PencilIcon aria-hidden="true" />
            {t('issues.editRequest')}
          </Button>
        ) : null}
      </div>
      <div className="rounded-xl border border-border bg-surface p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium text-foreground">
            <PersonName person={issue.reporter} />
          </span>
          <span className="text-muted-foreground">{formatDateTime(issue.createdAt, locale)}</span>
        </div>
        {draft === null ? (
          <RequestText description={issue.description} />
        ) : (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const checked = issueDescriptionSchema.safeParse(draft);
              setTooLong(!checked.success);
              if (!checked.success) {
                return;
              }
              if (checked.data !== issue.description) {
                onEdit({ field: 'description', description: checked.data });
              }
              setDraft(null);
            }}
            className="flex flex-col gap-3"
          >
            <Field
              label={t('issues.description')}
              description={t('issues.markdownHelp')}
              error={
                tooLong ? t('validation.tooLong', { max: ISSUE_DESCRIPTION_MAX_LENGTH }) : undefined
              }
            >
              {(control) => (
                <MarkdownEditor
                  label={t('issues.description')}
                  control={control}
                  value={draft}
                  onChange={setDraft}
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                {t('issues.cancel')}
              </Button>
              <Button type="submit">{t('issues.save')}</Button>
            </div>
          </form>
        )}
        <RequestAttachments issueKey={issue.key} canAttach={issue.actions.includes('attach')} />
      </div>
    </section>
  );
}
