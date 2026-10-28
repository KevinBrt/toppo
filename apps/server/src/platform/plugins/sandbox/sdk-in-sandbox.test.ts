import { fileURLToPath } from 'node:url';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import Fastify from 'fastify';
import { rolldown } from 'rolldown';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPluginSandbox, type PluginSandbox } from './plugin-sandbox.ts';

const WORKER = new URL('./sandbox-worker.ts', import.meta.url);
const ADA = '01a1569b-9900-7000-8000-000000000001';
const ISSUE = '01a1569b-9900-7000-8000-000000000042';
const NOW = '2026-11-02T09:00:00.000Z';

const snapshot = {
  id: ISSUE,
  key: 'WEB-42',
  projectId: '01a1569b-9900-7000-8000-000000000100',
  projectKey: 'WEB',
  title: 'Invoices fail to download',
  status: { id: '01a1569b-9900-7000-8000-000000000201', name: 'Done', closes: true },
  category: { id: '01a1569b-9900-7000-8000-000000000301', name: 'Bug' },
  priority: { id: '01a1569b-9900-7000-8000-000000000401', name: 'High', level: 3 },
  assigneeId: null,
  reporterId: ADA,
  closedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

/** The fixture plugin as its author's build would make it: one classic script, SDK and Zod in. */
async function bundle(): Promise<string> {
  const build = await rolldown({
    input: fileURLToPath(new URL('./sdk-plugin.fixture.ts', import.meta.url)),
    platform: 'neutral',
  });
  const { output } = await build.generate({ format: 'iife' });
  await build.close();
  return output[0].code;
}

const onCall = vi.fn((method: string, _args: unknown) =>
  Promise.resolve(method === 'issues.get' ? { ...snapshot, description: '' } : { commentId: ADA }),
);
let plugin: PluginSandbox;
let code: string;

beforeAll(async () => {
  code = await bundle();
  plugin = createPluginSandbox({
    code,
    memoryMb: 64,
    workerUrl: WORKER,
    onCall,
    log: Fastify({ logger: false }).log,
  });
});

afterAll(() => plugin.close());

function run(kind: 'action' | 'event', name: string, payload: unknown, context: object) {
  return plugin.run({ kind, name, payload, context, deadlineMs: 2000 });
}

describe('a plugin written with the SDK, in the sandbox', () => {
  it('declares a manifest Toppo accepts', async () => {
    const manifest = await plugin.manifest();

    expect(manifest.ok).toBe(true);
    expect(manifestSchema.parse(manifest.ok && manifest.value)).toMatchObject({
      id: 'sdk-check',
      needs: ['issue.read', 'comment.create'],
      actions: [{ name: 'timeEntry.log', access: { issue: 'issueId' } }],
      events: ['issue.statusChanged'],
    });
  });

  it('runs an action, Zod checking its input and its call to Toppo', async () => {
    const context = { locale: 'en', user: { id: ADA }, settings: {} };

    expect(
      await run('action', 'timeEntry.log', { issueId: ISSUE, minutes: 30 }, context),
    ).toStrictEqual({
      ok: true,
      value: { ok: true, result: { key: 'WEB-42', minutes: 30, user: ADA } },
    });
    expect(onCall).toHaveBeenCalledWith('issues.get', { issueId: ISSUE });
    expect(
      await run('action', 'timeEntry.log', { issueId: ISSUE, minutes: 0 }, context),
    ).toMatchObject({
      ok: true,
      value: { ok: false, error: { code: 'VALIDATION_FAILED' } },
    });
    expect(
      await run(
        'action',
        'timeEntry.log',
        { issueId: ISSUE, minutes: 90 },
        {
          ...context,
          settings: { maxMinutesPerDay: 60 },
        },
      ),
    ).toStrictEqual({
      ok: true,
      value: { ok: false, error: { code: 'errors.dailyLimit', params: { limit: 60 } } },
    });
  });

  it('handles an event in the instance’s language', async () => {
    const event = {
      event: { id: ISSUE, type: 'issue.statusChanged', occurredAt: NOW, actorId: ADA },
      issue: snapshot,
      change: { from: { id: ADA, name: 'Open' }, to: { id: snapshot.status.id, name: 'Done' } },
    };

    expect(
      await run('event', 'issue.statusChanged', event, { locale: 'fr', user: null, settings: {} }),
    ).toStrictEqual({ ok: true, value: { ok: true, result: null } });
    expect(onCall).toHaveBeenCalledWith('issues.comment', {
      issueId: ISSUE,
      body: 'Fermé, après 90 minutes.',
      once: ISSUE,
    });
  });
});
