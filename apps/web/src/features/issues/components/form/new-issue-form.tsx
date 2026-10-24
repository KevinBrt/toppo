import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ATTACHMENTS_MAX,
  type CreateIssueRequest,
  createIssueRequestSchema,
  ISSUE_TITLE_MAX_LENGTH,
} from '@toppo/shared';
import { Alert, Button, cn, Field, Input, Select, swatchClassName } from '@toppo/ui';
import { type FormEvent, useId, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Attachments, type FailedUpload } from '../../api/attachments.api.ts';
import { Issues } from '../../api/issues.api.ts';
import type { FileDraft, RefusedFile } from '../../models/attachment-draft.model.ts';
import {
  choiceOf,
  formProblems,
  type PropertyDraft,
  valuesOfDrafts,
} from '../../models/new-issue-form.model.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { chooseFiles } from '../../utils/attachment-files.util.ts';
import { DraftFiles, FailedUploads, RefusedFiles } from '../attachments/draft-files.tsx';
import { FileDropZone } from '../attachments/file-drop-zone.tsx';
import { MarkdownEditor } from '../markdown/markdown-editor.tsx';
import { PropertyInput } from '../properties/property-input.tsx';

const KNOWN_ERRORS = {
  INVALID_CATEGORY: 'issues.invalidCategory',
  INVALID_PRIORITY: 'issues.invalidPriority',
  PROJECT_ARCHIVED: 'projects.archivedNotice',
  PROPERTY_REQUIRED: 'issues.propertyRequired',
  CATEGORY_REQUIRED: 'issues.propertyRequired',
  PRIORITY_REQUIRED: 'issues.propertyRequired',
  PROPERTY_NOT_FOUND: 'issues.invalidProperty',
  INVALID_PROPERTY_OPTION: 'issues.invalidProperty',
  INVALID_PROPERTY_VALUE: 'issues.invalidValue',
  INVALID_PROPERTY_USER: 'issues.invalidPropertyUser',
} as const;

/** What a field the form refuses says beside it. */
const PROBLEM_MESSAGES = {
  required: 'issues.propertyRequired',
  invalid: 'issues.invalidValue',
} as const;

/**
 * Gives the subject the focus once, when the form opens: the page is for writing an issue.
 * Defined once, so that React calls it on mount only, not again at each render.
 */
const focusOnMount = (element: HTMLInputElement | null) => element?.focus();

/** How far the files of a new issue are sent. */
interface Sending {
  sent: number;
  total: number;
}

/**
 * A new issue of a project: its subject, description and files, then its priority, category and
 * the properties asked at creation, the project's defaults chosen unless it asks for a choice. Whoever reports it is its requester. The issue is created, then
 * its files are sent one after the other. Reports the new issue's key; when a file could not be
 * attached, says so first, the issue being there all the same.
 */
export function NewIssueForm({
  projectKey,
  canAssign,
  onCreated,
  onCancel,
}: {
  projectKey: string;
  /** Whether the reporter may name people: a person property is asked of those only. */
  canAssign: boolean;
  onCreated: (key: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fields = useQuery(IssuesQueries.fields(projectKey));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Empty until chosen: the project's default applies.
  const [priorityId, setPriorityId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  // What the field of each property asked at creation holds, by property id.
  const [properties, setProperties] = useState<Record<string, PropertyDraft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const limits = useQuery(IssuesQueries.attachmentLimits);
  const [drafts, setDrafts] = useState<FileDraft[]>([]);
  const [refused, setRefused] = useState<RefusedFile[]>([]);
  const [sending, setSending] = useState<Sending | null>(null);
  const [created, setCreated] = useState<{ key: string; failed: FailedUpload[] } | null>(null);

  const create = useMutation({
    mutationFn: async ({ issue, files }: { issue: CreateIssueRequest; files: FileDraft[] }) => {
      const key = await Issues.create(projectKey, issue);
      setSending({ sent: 0, total: files.length });
      const failed = await Attachments.addAll(key, files, {
        onSent: (sent) => setSending({ sent, total: files.length }),
      });
      return { key, failed };
    },
    onSuccess: async ({ key, failed }) => {
      await queryClient.invalidateQueries({ queryKey: IssuesQueries.allOf(projectKey) });
      if (failed.length === 0) {
        await onCreated(key);
      } else {
        setCreated({ key, failed });
      }
    },
    onSettled: () => setSending(null),
  });
  const choose = (picked: File[]) => {
    if (!limits.data) {
      return;
    }
    const chosen = chooseFiles(picked, {
      maxFileSize: limits.data.maxFileSize,
      room: ATTACHMENTS_MAX - drafts.length,
    });
    setRefused(chosen.refused);
    setDrafts([...drafts, ...chosen.drafts]);
  };
  const busy = create.isPending || created !== null;

  const settings = fields.data?.fieldSettings;
  const chosenPriority = choiceOf(priorityId, fields.data?.priorities, settings?.priority.required);
  const chosenCategory = choiceOf(categoryId, fields.data?.categories, settings?.category.required);
  const asked = (fields.data?.properties ?? []).filter(
    ({ askedAtCreation, type }) => askedAtCreation && (canAssign || type !== 'user'),
  );
  const clearError = (key: string) => setErrors(({ [key]: _, ...others }) => others);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createIssueRequestSchema.safeParse({
      title,
      description,
      ...(chosenPriority ? { priorityId: chosenPriority } : {}),
      ...(chosenCategory ? { categoryId: chosenCategory } : {}),
      properties: valuesOfDrafts(asked, properties),
    });
    // Said beside each field, as the server would refuse it.
    const problems = Object.fromEntries(
      Object.entries(
        formProblems({
          asked,
          drafts: properties,
          settings,
          priorityId: chosenPriority,
          categoryId: chosenCategory,
        }),
      ).map(([key, problem]) => [key, t(PROBLEM_MESSAGES[problem])]),
    );
    setErrors({ ...(parsed.success ? {} : fieldErrors(parsed.error, t)), ...problems });
    if (parsed.success && Object.keys(problems).length === 0 && !busy) {
      create.mutate({ issue: parsed.data, files: drafts });
    }
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-busy={create.isPending}
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <section className="flex flex-col rounded-xl border border-border bg-surface shadow-xs">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          {create.isError ? (
            <Alert tone="danger">{requestErrorMessage(create.error, t, KNOWN_ERRORS)}</Alert>
          ) : null}
          {created ? (
            <FailedUploads
              title={t('issues.attachments.createdWithout', { key: created.key })}
              failed={created.failed}
            />
          ) : null}
          <Field label={t('issues.subject')} required error={errors['title']}>
            {(control) => (
              <Input
                {...control}
                ref={focusOnMount}
                required
                value={title}
                maxLength={ISSUE_TITLE_MAX_LENGTH}
                autoComplete="off"
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('issues.description')}
            description={t('issues.markdownHelp')}
            error={errors['description']}
          >
            {(control) => (
              <MarkdownEditor
                label={t('issues.description')}
                control={control}
                value={description}
                onChange={setDescription}
              />
            )}
          </Field>
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="mb-1.5 text-sm font-medium text-foreground">
              {t('issues.attachments.title')}
            </legend>
            {limits.data ? (
              <FileDropZone
                maxFileSize={limits.data.maxFileSize}
                disabled={busy || drafts.length >= ATTACHMENTS_MAX}
                onFiles={choose}
              />
            ) : null}
            <RefusedFiles refused={refused} maxFileSize={limits.data?.maxFileSize ?? 0} />
            <DraftFiles
              drafts={drafts}
              sending={create.isPending}
              onRemove={
                busy ? undefined : (id) => setDrafts(drafts.filter((draft) => draft.id !== id))
              }
            />
          </fieldset>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          {created ? (
            <Button onClick={() => onCreated(created.key)}>
              {t('issues.attachments.openIssue')}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onCancel}>
                {t('issues.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                <SubmitLabel sending={sending} creating={create.isPending} />
              </Button>
            </>
          )}
        </div>
      </section>
      <aside className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6">
        <h2 className="text-base font-semibold text-foreground">{t('issues.properties')}</h2>
        {settings?.priority.hidden ? null : (
          <PriorityChoice
            priorities={fields.data?.priorities}
            value={chosenPriority}
            required={settings?.priority.required ?? false}
            error={errors['priorityId']}
            onChange={(id) => {
              setPriorityId(id);
              clearError('priorityId');
            }}
          />
        )}
        {settings?.category.hidden ? null : (
          <CategoryChoice
            categories={fields.data?.categories ?? []}
            value={chosenCategory}
            required={settings?.category.required ?? false}
            error={errors['categoryId']}
            onChange={(id) => {
              setCategoryId(id);
              clearError('categoryId');
            }}
          />
        )}
        {asked.map((property) => (
          <PropertyInput
            key={property.id}
            property={property}
            draft={properties[property.id]}
            error={errors[`property.${property.id}`]}
            projectKey={projectKey}
            onChange={(draft) => {
              setProperties({ ...properties, [property.id]: draft });
              clearError(`property.${property.id}`);
            }}
          />
        ))}
      </aside>
    </form>
  );
}

/** What the submit button says: the files being sent once the issue is created. */
function SubmitLabel({ sending, creating }: { sending: Sending | null; creating: boolean }) {
  const { t } = useI18n();
  if (sending) {
    return t('issues.attachments.sendingCount', sending);
  }
  return creating ? t('issues.creating') : t('issues.create');
}

/** The priorities in a list, none chosen beforehand when the project asks for one. */
function PriorityChoice({
  priorities,
  value,
  required,
  error,
  onChange,
}: {
  priorities: readonly { id: string; name: string }[] | undefined;
  value: string;
  required: boolean;
  error: string | undefined;
  onChange: (priorityId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Field label={t('issues.priority')} required={required} error={error}>
      {(control) => (
        <Select
          {...control}
          value={value}
          disabled={!priorities}
          onChange={(event) => onChange(event.target.value)}
        >
          {required ? <option value="">{t('issues.chooseOption')}</option> : null}
          {(priorities ?? []).map((priority) => (
            <option key={priority.id} value={priority.id}>
              {priority.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** The categories as buttons side by side: radio buttons, each with its color. */
function CategoryChoice({
  categories,
  value,
  required,
  error,
  onChange,
}: {
  categories: readonly { id: string; name: string; color: Parameters<typeof swatchClassName>[0] }[];
  value: string;
  /** None is chosen beforehand: one must be. */
  required: boolean;
  error: string | undefined;
  onChange: (categoryId: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-1.5"
      aria-invalid={Boolean(error)}
      {...(error ? { 'aria-describedby': `${id}-error` } : {})}
    >
      <legend className="mb-1.5 text-sm font-medium text-foreground">
        {t('issues.category')}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {categories.map((category) => (
          <label
            key={category.id}
            className="relative flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover has-checked:border-primary has-checked:bg-primary-subtle has-checked:text-primary-subtle-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring pointer-coarse:min-h-11"
          >
            <input
              type="radio"
              name={`${id}-category`}
              value={category.id}
              checked={value === category.id}
              onChange={() => onChange(category.id)}
              // Transparent over the button: clicked and focused where it is seen.
              className="absolute inset-0 cursor-pointer appearance-none opacity-0"
            />
            <span
              aria-hidden="true"
              className={cn('size-2 rounded-full', swatchClassName(category.color))}
            />
            {category.name}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
