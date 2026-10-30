import type { WebhookRequest, WebhookSummary } from '@toppo-tracker/shared';
import type { ReactNode } from 'react';
import type { PlainMessageKey } from '../../../shared/i18n/i18n.types.ts';

/** Where a webhook is told of: every project, present and future, or those chosen. */
export type WebhookReach = 'all' | 'chosen';

/** A project a webhook is told of, as the picker shows it. */
export interface PickedProject {
  key: string;
  name: string;
}

/**
 * Draws the picker of the projects a webhook is told of. Projects are another feature: the screen
 * passes the picker in.
 */
export type ProjectPickerSlot = (props: {
  label: string;
  chosen: readonly PickedProject[];
  onChange: (chosen: PickedProject[]) => void;
}) => ReactNode;

/** A webhook as its form edits it. */
export interface WebhookForm {
  name: string;
  url: string;
  events: readonly string[];
  reach: WebhookReach;
  projects: readonly PickedProject[];
  allowPrivate: boolean;
}

/** The form, filled with the webhook as it is, or empty for a new one. */
export function webhookForm(webhook?: WebhookSummary): WebhookForm {
  return {
    name: webhook?.name ?? '',
    url: webhook?.url ?? '',
    events: webhook?.events ?? [],
    reach: webhook?.allProjects === false ? 'chosen' : 'all',
    projects: webhook?.projects.map(({ key, name }) => ({ key, name })) ?? [],
    allowPrivate: webhook?.allowPrivate ?? false,
  };
}

/** What the server is sent. */
export function webhookRequest(form: WebhookForm): WebhookRequest {
  return {
    name: form.name.trim(),
    url: form.url.trim(),
    events: [...form.events],
    projects: form.reach === 'all' ? 'all' : form.projects.map(({ key }) => key),
    allowPrivate: form.allowPrivate,
  };
}

/**
 * What the server would refuse beyond the shape of each field, by field: no event, no project
 * chosen, or a request in clear to an address that is not allowed inside the network.
 */
export function webhookFormProblems(
  form: WebhookForm,
): Partial<Record<'url' | 'events' | 'projects', PlainMessageKey>> {
  return {
    ...(/^http:/i.test(form.url.trim()) && !form.allowPrivate
      ? { url: 'webhooks.httpsOnly' as const }
      : {}),
    ...(form.events.length === 0 ? { events: 'webhooks.chooseEvents' as const } : {}),
    ...(form.reach === 'chosen' && form.projects.length === 0
      ? { projects: 'webhooks.chooseProjects' as const }
      : {}),
  };
}
