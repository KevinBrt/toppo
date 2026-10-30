import { type WebhookRequest, webhookRequestSchema } from '@toppo-tracker/shared';
import { Alert, Button, Field, Input, Switch } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { fieldErrors } from '../../../../shared/forms/form-errors.util.ts';
import type { PlainMessageKey } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { ISSUE_EVENT_MESSAGES } from '../../../../shared/i18n/issue-events.constants.ts';
import {
  type WebhookForm as Form,
  type ProjectPickerSlot,
  type WebhookReach,
  webhookFormProblems,
  webhookRequest,
} from '../../models/webhook-form.model.ts';

const REACHES: readonly WebhookReach[] = ['all', 'chosen'];

const REACH_LABELS = {
  all: 'webhooks.allProjects',
  chosen: 'webhooks.chosenProjects',
} as const satisfies Record<WebhookReach, PlainMessageKey>;

const EVENTS = [...ISSUE_EVENT_MESSAGES];

/**
 * Where a webhook is sent, what of and in which projects, checked as the server would before it
 * is sent. The screen saves it and says how that went.
 */
export function WebhookForm({
  initial,
  projectPicker,
  submitLabel,
  pendingLabel,
  pending,
  problem,
  done,
  onEdit,
  onSubmit,
}: {
  initial: Form;
  projectPicker: ProjectPickerSlot;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  /** Why the server refused it, in words. */
  problem?: string | undefined;
  /** Said once it is saved. */
  done?: string | undefined;
  onEdit: () => void;
  onSubmit: (request: WebhookRequest) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function edit(next: Partial<Form>) {
    setForm({ ...form, ...next });
    onEdit();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = webhookRequestSchema.safeParse(webhookRequest(form));
    const found = parsed.success ? {} : fieldErrors(parsed.error, t);
    if (found['url']) {
      found['url'] = t('validation.url');
    }
    for (const [field, message] of Object.entries(webhookFormProblems(form))) {
      found[field] = t(message);
    }
    setErrors(found);
    if (parsed.success && Object.keys(found).length === 0) {
      onSubmit(parsed.data);
    }
  }

  const chosen = new Set(form.events);
  return (
    <form noValidate onSubmit={submit} aria-busy={pending} className="flex flex-col gap-5">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      <Field label={t('webhooks.name')} required error={errors['name']}>
        {(control) => (
          <Input
            {...control}
            value={form.name}
            placeholder={t('webhooks.namePlaceholder')}
            maxLength={80}
            onChange={(event) => edit({ name: event.target.value })}
          />
        )}
      </Field>
      <Field
        label={t('webhooks.url')}
        description={t('webhooks.urlHelp')}
        required
        error={errors['url']}
      >
        {(control) => (
          <Input
            {...control}
            type="url"
            value={form.url}
            placeholder={t('webhooks.urlPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            maxLength={2000}
            className="font-mono"
            onChange={(event) => edit({ url: event.target.value })}
          />
        )}
      </Field>
      <Field
        label={t('webhooks.allowPrivate')}
        description={t('webhooks.allowPrivateHelp')}
        layout="row"
      >
        {(control) => (
          <Switch
            {...control}
            checked={form.allowPrivate}
            onCheckedChange={(allowPrivate) => edit({ allowPrivate })}
          />
        )}
      </Field>
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t('webhooks.events')}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-muted-foreground">{t('webhooks.eventsHelp')}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => edit({ events: EVENTS.map(([type]) => type) })}
          >
            {t('webhooks.chooseAllEvents')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => edit({ events: [] })}>
            {t('webhooks.clearEvents')}
          </Button>
        </div>
        <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
          {EVENTS.map(([type, message]) => (
            <label
              key={type}
              className="flex items-start gap-2 py-1 text-sm text-foreground pointer-coarse:min-h-11 pointer-coarse:items-center"
            >
              <input
                type="checkbox"
                checked={chosen.has(type)}
                onChange={(event) =>
                  edit({
                    events: event.target.checked
                      ? EVENTS.map(([known]) => known).filter(
                          (known) => known === type || chosen.has(known),
                        )
                      : form.events.filter((known) => known !== type),
                  })
                }
                className="mt-0.5 size-4 shrink-0 accent-primary pointer-coarse:mt-0"
              />
              <span className="min-w-0">
                {t(message)}
                <span className="block font-mono text-xs text-muted-foreground">{type}</span>
              </span>
            </label>
          ))}
        </div>
        {errors['events'] ? (
          <p className="text-xs font-medium text-danger">{errors['events']}</p>
        ) : null}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-foreground">
          {t('webhooks.projects')}
        </legend>
        <div className="flex flex-col gap-x-5 gap-y-2 sm:flex-row sm:flex-wrap">
          {REACHES.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 text-sm text-foreground pointer-coarse:min-h-11"
            >
              <input
                type="radio"
                name="webhook-reach"
                value={option}
                checked={form.reach === option}
                onChange={() => edit({ reach: option })}
                className="size-4 accent-primary"
              />
              {t(REACH_LABELS[option])}
            </label>
          ))}
        </div>
        {form.reach === 'chosen'
          ? projectPicker({
              label: t('webhooks.chosenProjects'),
              chosen: form.projects,
              onChange: (projects) => edit({ projects }),
            })
          : null}
        {errors['projects'] ? (
          <p className="text-xs font-medium text-danger">{errors['projects']}</p>
        ) : null}
      </fieldset>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {done ? (
          <p role="status" className="text-sm text-muted-foreground">
            {done}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
