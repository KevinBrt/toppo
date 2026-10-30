# Testing

`@toppo-tracker/plugin-testing` runs a plugin against a Toppo in memory, with Toppo's rules: access checked before the run, calls limited to its needs, `once` honoured, records checked and counted. No instance, no database: a test takes milliseconds.

```ts
import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import { plugin } from '../plugin.ts';
import { logTime } from './log-time.action.ts';

describe('timeEntry.log', () => {
  it('keeps the time spent on an issue, and counts it again', async () => {
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue();
    const logger = toppo.createUser({ permissions: ['entries.log'] });

    await logger.run(logTime, { issueId: issue.id, minutes: 90, spentOn: '2026-10-28' });

    expect(toppo.records('timeEntry')).toMatchObject([{ fields: { minutes: 90 } }]);
    expect(toppo.properties(issue.id)).toStrictEqual({ timeSpent: 90 });
  });
});
```

## The Toppo it gives

`createTestToppo(plugin, options?)` checks the plugin's manifest as Toppo would, then answers:

| Member                                     | What it does                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `createIssue(fields?)`                     | An issue of a test project, `WEB-1`, `WEB-2`…                                                                                               |
| `createUser({ sees?, permissions? })`      | Someone who sees those issues (all by default) and holds those of the plugin's permissions                                                  |
| `user.run(action, input)`                  | Runs an action for them, and answers its result                                                                                             |
| `emit(event, { issue, change, actorId? })` | Hands the plugin an event                                                                                                                   |
| `runJob(job)`                              | Runs one of its jobs                                                                                                                        |
| `receive(route, request?)`                 | Sends one of its routes a request from outside Toppo, and answers `{ status, body? }`: `signed(check, body)` signs one as the service would |
| `records(entity)`, `properties(issueId)`   | What it wrote                                                                                                                               |
| `comments`, `requests`                     | The comments it wrote, the requests it sent outside Toppo                                                                                   |
| `manifest`                                 | What it declares, as Toppo reads it                                                                                                         |

`options` gives it `settings`, a project's `projectSettings` (by project id), the `locale` (`'en'` by default), and `http`: a function answering the plugin's requests, or a failure code. Without it, every request fails with `NETWORK_ERROR`.

## Refusals

A run Toppo or the plugin refuses rejects with a `PluginRunError`, whose `code` says why:

- `NOT_FOUND`: an issue the person does not see.
- `FORBIDDEN`: a permission they lack.
- `VALIDATION_FAILED`, with its `issues`: an input the action's schema refuses.
- The plugin's own message key, with its `params`: a `ctx.fail`.
- `PLUGIN_ERROR`, with its `detail`: anything else it threw, or a call Toppo refused.

```ts
await expect(stranger.run(logTime, entry)).rejects.toMatchObject({ code: 'FORBIDDEN' });
```

## What it does not do

It does not reproduce the sandbox's deadline and memory, nor the guard of addresses inside the network, and it draws no screen: test what a screen does through the actions it runs. Only the definitions a test imports are registered: import the action, event handler or job under test.
