# The context

Every handler is given `ctx`: what it runs with, and its only way into Toppo.

| Member                       | What it is                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `ctx.settings`               | The instance's settings, parsed with the plugin's schema, defaults applied, secrets opened |
| `ctx.locale`                 | `'en'` or `'fr'`: the person's language in an action, English in an event or a job         |
| `ctx.t(key, params?)`        | One of the plugin's messages, in that language                                             |
| `ctx.fail(key, params?)`     | What to throw to refuse, in the plugin's own words                                         |
| `ctx.user`                   | `{ id }` of the person an action runs for; absent in events and jobs                       |
| `ctx.issues`                 | Issues of its projects: below                                                              |
| `ctx.projects.settings(id)`  | A project's settings, parsed, defaults applied                                             |
| `ctx.entities.<name>`        | Its records: see [records](./data#entities)                                                |
| `ctx.http.fetch(url, init?)` | A request outside Toppo: see [reaching outside Toppo](./outside-toppo)                     |

## Issues

- **`ctx.issues.get(issueId)`** answers the issue, or `null` for one it does not see: its key, project, title and description, status, priority, category, assignee and requester, dates, and the values of the plugin's own properties. Takes `issue.read`.
- **`ctx.issues.find(key)`** answers the issue of a key as `get` does, the key read as people write it (`web-12` names `WEB-12`); `null` when it sees no issue of that key, or the text is no key, so that a word read in a commit's message names nothing. 100 characters at most. Takes `issue.read`.
- **`ctx.issues.comment(issueId, body, { once? })`** comments on it as the plugin's own user, 20,000 characters at most, and answers `{ commentId }`. Takes `comment.create`, and in an action the person must hold it too. With `once`, a key of yours, the comment is written once however many times it is asked: an event handled twice comments once. Keys are kept 7 days.
- **`ctx.issues.setProperty(issueId, property, value)`** writes one of its own properties: see [properties](./data#properties).

## A project's settings

`await ctx.projects.settings(projectId)` answers what that project set, parsed with `projectSettings`, its defaults applied. It takes no need, but the plugin, and in an action the person, must reach the project: otherwise it refuses with `PROJECT_NOT_FOUND`.

## When Toppo refuses a call

A call Toppo refuses rejects with an `Error` whose `message` is the reason's code: `FORBIDDEN` (a need the plugin, or the person, lacks), `ISSUE_NOT_FOUND`, `PROJECT_NOT_FOUND`, `RECORD_LIMIT_REACHED`, `INVALID_ARGUMENTS`… A failure of Toppo's own answers `INTERNAL_ERROR`, its detail kept to Toppo's log.

Toppo works on four of a run's calls at once, and a thousand more wait their turn: past that, a call is refused with `TOO_MANY_CALLS`. Calls still waiting when the run ends are dropped. Await what you ask, or a few calls at a time.

Nothing else reaches outside the sandbox: no `console`, no timers, no Node module. What the plugin needs to say, it says through its answer, its records or a comment.
