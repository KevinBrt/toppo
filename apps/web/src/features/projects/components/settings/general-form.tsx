import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type PaletteColor,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_KEY_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  type ProjectResponse,
  type UpdateProjectRequest,
  updateProjectRequestSchema,
} from '@toppo-tracker/shared';
import { Alert, Button, ColorPicker, Field, Input, Textarea } from '@toppo-tracker/ui';
import { type FormEvent, useId, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Projects } from '../../api/projects.api.ts';
import { PROJECT_COLORS } from '../../constants/project-colors.constants.ts';
import { ProjectsQueries } from '../../queries/projects.queries.ts';

const KNOWN_ERRORS = {
  PROJECT_KEY_TAKEN: 'projects.keyTaken',
  PROJECT_KEY_FIXED: 'projects.keyFixedError',
  PROJECT_ARCHIVED: 'projects.archivedNotice',
} as const;

/** The number the key's example shows: any will do, it only shows the shape of an issue key. */
const EXAMPLE_NUMBER = 42;

/**
 * A project's name, key, color and description, one per row. The key is fixed once the project
 * has had issues. Reports a new key, for the screen to follow it.
 */
export function GeneralForm({
  project,
  onKeyChanged,
}: {
  project: ProjectResponse;
  onKeyChanged: (key: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const [key, setKey] = useState(project.key);
  const [color, setColor] = useState<PaletteColor>(project.color);
  const [description, setDescription] = useState(project.description);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (changes: UpdateProjectRequest) => Projects.update(project.key, changes),
    onSuccess: async (_nothing, changes) => {
      await queryClient.invalidateQueries({ queryKey: ProjectsQueries.all });
      if (changes.key !== project.key) {
        await onKeyChanged(changes.key);
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = updateProjectRequestSchema.safeParse({ key, name, description, color });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error, t));
    if (parsed.success) {
      save.mutate(parsed.data);
    }
  }

  const example = `${key || project.key}-${EXAMPLE_NUMBER}`;
  return (
    <form
      noValidate
      onSubmit={submit}
      aria-busy={save.isPending}
      className="rounded-xl border border-border bg-surface shadow-xs"
    >
      {save.isError ? (
        <div className="px-5 pt-5">
          <Alert tone="danger">{requestErrorMessage(save.error, t, KNOWN_ERRORS)}</Alert>
        </div>
      ) : null}
      <div className="divide-y divide-border">
        <Field
          layout="row"
          label={t('projectSettings.name')}
          required
          error={errors['name']}
          className="px-5 py-4"
        >
          {(control) => (
            <Input
              {...control}
              value={name}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field
          layout="row"
          label={t('projects.key')}
          required={project.keyEditable}
          description={project.keyEditable ? t('projectSettings.keyHelp') : t('projects.keyFixed')}
          error={errors['key']}
          className="px-5 py-4"
        >
          {(control) => (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Input
                {...control}
                value={key}
                maxLength={PROJECT_KEY_MAX_LENGTH}
                readOnly={!project.keyEditable}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => setKey(event.target.value.toUpperCase())}
                className="w-32 font-mono read-only:bg-surface-muted read-only:text-muted-foreground"
              />
              <span className="text-xs text-muted-foreground">
                {t('projectSettings.keyExample', { issue: example, path: `/issues/${example}` })}
              </span>
            </div>
          )}
        </Field>
        <ColorChoice value={color} onChange={setColor} />
        <Field
          layout="row"
          label={t('projects.description')}
          description={t('projectSettings.descriptionHelp')}
          error={errors['description']}
          className="px-5 py-4"
        >
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              value={description}
              maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-3">
        {save.isSuccess ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('projectSettings.saved')}
          </p>
        ) : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? t('projectSettings.saving') : t('projectSettings.save')}
        </Button>
      </div>
    </form>
  );
}

/** The project's color, chosen among the palette's swatches. */
function ColorChoice({
  value,
  onChange,
}: {
  value: PaletteColor;
  onChange: (color: PaletteColor) => void;
}) {
  const { t } = useI18n();
  const id = useId();

  return (
    <div className="grid gap-x-8 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center">
      <p id={`${id}-label`} className="text-sm font-medium text-foreground">
        {t('projectSettings.color')}
      </p>
      <ColorPicker
        labelledBy={`${id}-label`}
        colors={PROJECT_COLORS}
        value={value}
        nameOf={(color) => t(`colors.${color}`)}
        onChange={onChange}
      />
    </div>
  );
}
