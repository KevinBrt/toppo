import { describe, expect, it } from 'vitest';
import { WEBHOOK_PROJECTS_MAX, webhookRequestSchema } from './webhooks.ts';

const REQUEST = {
  name: ' Deployments ',
  url: 'https://deploy.example.com/hooks',
  events: ['issue.created'],
  projects: 'all',
};

describe('webhookRequestSchema', () => {
  it('takes a webhook told of every project, kept out of the network unless allowed', () => {
    expect(webhookRequestSchema.parse(REQUEST)).toStrictEqual({
      ...REQUEST,
      name: 'Deployments',
      allowPrivate: false,
    });
  });

  it('keeps its address as browsers write it', () => {
    const { url } = webhookRequestSchema.parse({ ...REQUEST, url: 'HTTPS://Deploy.Example.com' });

    expect(url).toBe('https://deploy.example.com/');
  });

  it.each([
    'https://ci:hunter2@deploy.example.com/',
    'https://ci@deploy.example.com/',
    'ftp://deploy.example.com/',
    'deploy.example.com/hooks',
    `https://deploy.example.com/${'a'.repeat(2000)}`,
  ])('refuses the address %s', (url) => {
    expect(webhookRequestSchema.safeParse({ ...REQUEST, url }).success).toBe(false);
  });

  it('names its projects by key, 100 at most', () => {
    const named = (count: number) =>
      webhookRequestSchema.safeParse({ ...REQUEST, projects: Array(count).fill('WEB') }).success;

    expect(named(WEBHOOK_PROJECTS_MAX)).toBe(true);
    expect(named(WEBHOOK_PROJECTS_MAX + 1)).toBe(false);
    expect(webhookRequestSchema.safeParse({ ...REQUEST, projects: ['web site'] }).success).toBe(
      false,
    );
  });

  it('hears of one event at least, 16 at most', () => {
    const hears = (count: number) =>
      webhookRequestSchema.safeParse({ ...REQUEST, events: Array(count).fill('issue.created') })
        .success;

    expect(hears(0)).toBe(false);
    expect(hears(16)).toBe(true);
    expect(hears(17)).toBe(false);
  });
});
