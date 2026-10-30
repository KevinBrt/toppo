# Actions

An action is what a plugin answers when asked: by its screens, mostly, for the person looking at them. It runs for that person, with what both they and the plugin may do.

<<< @/../plugins/time-tracking/src/actions/log-time.action.ts

## Declaring one

`plugin.defineAction({ name, access, input, handler })`:

- **`name`**: `resource.action`, such as `timeEntry.log`, 60 characters at most; 100 actions at most.
- **`input`**: a Zod schema. Toppo hands the input to the plugin, which checks it with this schema in its sandbox: a refusal answers `VALIDATION_FAILED`, field by field.
- **`handler(ctx, input)`**: answers the result, any JSON value. See [the context](./context).

## Who may run it

`access` is checked by Toppo before the plugin runs:

| `access`                                          | Who may run it                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `'authenticated'`                                 | Anyone signed in                                                                     |
| `{ permission: 'reports.read' }`                  | Who holds that permission, one of the plugin's of the instance (`scope: 'instance'`) |
| `{ issue: 'issueId' }`                            | Who sees the issue the input's `issueId` names, in a project the plugin acts in      |
| `{ issue: 'issueId', permission: 'entries.log' }` | Who sees the issue and holds the permission in its project                           |

An issue the person or the plugin does not see answers 404, as if it did not exist. An action on an issue takes the need `issue.read`.

Without an issue, there is no project to hold a permission of projects in: only one of the plugin's permissions of the instance is held there. From API 1.1, the build and Toppo refuse one of projects in an action on no issue. An action that needs more than one permission checks the others itself, with [`ctx.people.can`](./context#people).

## When it refuses

```ts
if (input.minutes > ctx.settings.maxMinutes) {
  throw ctx.fail('errors.tooMuch', { limit: ctx.settings.maxMinutes });
}
```

`ctx.fail(key, params)` gives what to throw to refuse, in the plugin's own words: one of its message keys, which its screens translate. The request answers 422 `PLUGIN_REFUSED`, with that key and its values. Anything else the plugin throws answers 422 with the code `PLUGIN_ERROR`, its message kept to Toppo's log.

## Its limits

- **5 seconds** for the whole run, Toppo's calls included.
- 64 KB of input, 300 actions a minute per person (screens read through them too).
- An action that fails, or times out, never counts toward [disabling the plugin](./installing#when-it-keeps-failing): anyone signed in may run it with what makes it fail.

Over HTTP, an action is `POST /api/v1/plugins/<id>/actions/<name>`, with the input as JSON, for the person signed in; it answers `{ "result": … }`.
