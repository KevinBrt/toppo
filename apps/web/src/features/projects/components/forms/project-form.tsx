import {
  type CreateProjectRequest,
  createProjectRequestSchema,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_KEY_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '@toppo-tracker/shared';
import { Alert, Button, Field, Input, Textarea } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { suggestProjectKey } from '../../utils/project-key.util.ts';

const KNOWN_ERRORS = { PROJECT_KEY_TAKEN: 'projects.keyTaken' } as const;

/** A new project's name, key and description. Its key follows its name until the person types one. */
export function ProjectForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  /** The server's refusal of the last attempt, if any. */
  error: unknown;
  onSubmit: (project: CreateProjectRequest) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTyped, setKeyTyped] = useState(false);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createProjectRequestSchema.safeParse({ key, name, description });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error, t));
    if (parsed.success) {
      onSubmit(parsed.data);
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-busy={pending} className="flex flex-col gap-5">
      {error ? <Alert tone="danger">{requestErrorMessage(error, t, KNOWN_ERRORS)}</Alert> : null}
      <Field label={t('projects.name')} required error={errors['name']}>
        {(control) => (
          <Input
            {...control}
            value={name}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              if (!keyTyped) {
                setKey(suggestProjectKey(event.target.value));
              }
            }}
          />
        )}
      </Field>
      <Field
        label={t('projects.key')}
        required
        description={t('projects.keyHelp')}
        error={errors['key']}
      >
        {(control) => (
          <Input
            {...control}
            value={key}
            maxLength={PROJECT_KEY_MAX_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(event) => {
              setKey(event.target.value.toUpperCase());
              setKeyTyped(true);
            }}
            className="w-40 font-mono"
          />
        )}
      </Field>
      <Field label={t('projects.description')} error={errors['description']}>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            value={description}
            maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? t('projects.creating') : t('projects.create')}
      </Button>
    </form>
  );
}
