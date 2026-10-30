import { describe, expect, it } from 'vitest';
import { webhookForm, webhookFormProblems, webhookRequest } from './webhook-form.model.ts';

const SAVED = {
  id: '01a1569b-9900-7000-8000-000000001301',
  name: 'Deployments',
  url: 'https://deploy.example.com/hooks',
  events: ['issue.created'],
  allProjects: false,
  projects: [{ id: '01a1569b-9900-7000-8000-000000000501', key: 'WEB', name: 'Website' }],
  allowPrivate: false,
  enabled: true,
  failures: 0,
  lastError: null,
  createdAt: '2026-10-20T09:14:00.000Z',
};

describe('the webhook form', () => {
  it('starts empty, told of every project', () => {
    expect(webhookForm()).toStrictEqual({
      name: '',
      url: '',
      events: [],
      reach: 'all',
      projects: [],
      allowPrivate: false,
    });
  });

  it('starts from a webhook as it is, and sends it back trimmed', () => {
    const form = { ...webhookForm(SAVED), name: '  Deployments ', url: ' https://a.example/ ' };

    expect(form).toMatchObject({ reach: 'chosen', projects: [{ key: 'WEB', name: 'Website' }] });
    expect(webhookRequest(form)).toStrictEqual({
      name: 'Deployments',
      url: 'https://a.example/',
      events: ['issue.created'],
      projects: ['WEB'],
      allowPrivate: false,
    });
    expect(webhookRequest({ ...form, reach: 'all' }).projects).toBe('all');
  });

  it('finds what the server would refuse', () => {
    const form = { ...webhookForm(), url: 'HTTP://10.0.0.5/', reach: 'chosen' as const };

    expect(webhookFormProblems(form)).toStrictEqual({
      url: 'webhooks.httpsOnly',
      events: 'webhooks.chooseEvents',
      projects: 'webhooks.chooseProjects',
    });
    expect(
      webhookFormProblems({ ...webhookForm(SAVED), url: 'http://10.0.0.5/', allowPrivate: true }),
    ).toStrictEqual({});
  });
});
