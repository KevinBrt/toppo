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
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { chooseFiles } from '../../utils/attachment-files.util.ts';
import { DraftFiles, FailedUploads, RefusedFiles } from '../attachments/draft-files.tsx';
import { FileDropZone } from '../attachments/file-drop-zone.tsx';
import { MarkdownEditor } from '../markdown/markdown-editor.tsx';

const KNOWN_ERRORS = {
  INVALID_CATEGORY: 'issues.invalidCategory',
  INVALID_PRIORITY: 'issues.invalidPriority',
  PROJECT_ARCHIVED: 'projects.archivedNotice',
  PROPERTY_REQUIRED: 'issues.propertyRequired',
  PROPERTY_NOT_FOUND: 'issues.invalidProperty',
  INVALID_PROPERTY_OPTION: 'issues.invalidProperty',
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
 * A new issue of a project: its subject, description and files, then its priority and category,
 * the project's defaults chosen. Whoever reports it is its requester. The issue is created, then
 * its files are sent one after the other. Reports the new issue's key; when a file could not be
 * attached, says so first, the issue being there all the same.
 */
export function NewIssueForm({
  projectKey,
  onCreated,
  onCancel,
}: {
  projectKey: string;
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
  // The option chosen for each property asked at creation, by property id.
  const [values, setValues] = useState<Record<string, string>>({});
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

  const defaultPriority = fields.data?.priorities.find(({ isDefault }) => isDefault)?.id ?? '';
  const defaultCategory = fields.data?.categories.find(({ isDefault }) => isDefault)?.id ?? '';
  const chosenPriority = priorityId || defaultPriority;
  const chosenCategory = categoryId || defaultCategory;
  const asked = (fields.data?.properties ?? []).filter(({ askedAtCreation }) => askedAtCreation);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createIssueRequestSchema.safeParse({
      title,
      description,
      ...(chosenPriority ? { priorityId: chosenPriority } : {}),
      ...(chosenCategory ? { categoryId: chosenCategory } : {}),
      properties: Object.fromEntries(Object.entries(values).filter(([, optionId]) => optionId)),
    });
    // Said beside each property, as the server would refuse it.
    const missing = Object.fromEntries(
      asked
        .filter(({ id, required }) => required && !values[id])
        .map(({ id }) => [`property.${id}`, t('issues.propertyRequired')]),
    );
    setErrors({ ...(parsed.success ? {} : fieldErrors(parsed.error, t)), ...missing });
    if (parsed.success && Object.keys(missing).length === 0 && !busy) {
      create.mutate({ issue: parsed.data, files: drafts });
    }
  }

  function submitLabel(): string {
    if (sending) {
      return t('issues.attachments.sendingCount', sending);
    }
    return create.isPending ? t('issues.creating') : t('issues.create');
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
                {submitLabel()}
              </Button>
            </>
          )}
        </div>
      </section>
      <aside className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-xs sm:p-6">
        <h2 className="text-base font-semibold text-foreground">{t('issues.properties')}</h2>
        <Field label={t('issues.priority')}>
          {(control) => (
            <Select
              {...control}
              value={chosenPriority}
              disabled={!fields.data}
              onChange={(event) => setPriorityId(event.target.value)}
            >
              {(fields.data?.priorities ?? []).map((priority) => (
                <option key={priority.id} value={priority.id}>
                  {priority.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <CategoryChoice
          categories={fields.data?.categories ?? []}
          value={chosenCategory}
          onChange={setCategoryId}
        />
        {asked.map((property) => (
          <Field
            key={property.id}
            label={property.name}
            required={property.required}
            error={errors[`property.${property.id}`]}
          >
            {(control) => (
              <Select
                {...control}
                value={values[property.id] ?? ''}
                onChange={(event) => {
                  setValues({ ...values, [property.id]: event.target.value });
                  setErrors(({ [`property.${property.id}`]: _, ...others }) => others);
                }}
              >
                <option value="">
                  {property.required ? t('issues.chooseOption') : t('issues.noValue')}
                </option>
                {property.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ))}
      </aside>
    </form>
  );
}

/** The categories as buttons side by side: radio buttons, each with its color. */
function CategoryChoice({
  categories,
  value,
  onChange,
}: {
  categories: readonly { id: string; name: string; color: Parameters<typeof swatchClassName>[0] }[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-foreground">{t('issues.category')}</legend>
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
    </fieldset>
  );
}
