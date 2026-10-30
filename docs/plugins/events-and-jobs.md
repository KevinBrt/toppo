# Events and jobs

What a plugin does when nobody asks it: it hears of changes, and it works on its own. In both, it acts as itself, with its needs, in the projects it is approved in.

## Events

```ts
plugin.defineEventHandler({
  event: 'issue.statusChanged',
  async handler(ctx, { event, issue, change }) {
    // The issue as it stands: closed by the status it moved to.
    if (issue.status.closes) {
      await ctx.issues.comment(issue.id, ctx.t('comments.closed', { status: change.to.name }), {
        once: event.id,
      });
    }
  },
});
```

One handler per event; the events it handles are part of what an administrator approves. Each is given:

- **`event`**: `{ id, type, occurredAt, actorId }`, who made the change.
- **`issue`**: the issue as it stands, without its description: `{ id, key, projectId, projectKey, title, status, category, priority, assigneeId, reporterId, closedAt, createdAt, updatedAt }`. For `issue.deleted`, only `{ id, key, projectId }`.
- **`change`**: what changed.

| Event                                             | `change`                                                 |
| ------------------------------------------------- | -------------------------------------------------------- |
| `issue.created`, `issue.deleted`                  | `{}`                                                     |
| `issue.titleChanged`, `issue.descriptionChanged`  | `{ from, to }`, the texts                                |
| `issue.statusChanged`, `issue.categoryChanged`    | `{ from, to }`, each `{ id, name }`                      |
| `issue.priorityChanged`                           | `{ from, to }`, each `{ id, name, level }`, level 1 to 4 |
| `issue.assigneeChanged`, `issue.duplicateChanged` | `{ from, to }`, ids or `null`                            |
| `issue.labelsChanged`                             | `{ added, removed }`, each `{ id, name }`                |
| `issue.propertyChanged`                           | `{ type, property, from, to }`, by the property's type   |
| `issue.commented`, `issue.commentEdited`          | `{ comment: { id, authorId, body, mentioned } }`         |
| `issue.commentDeleted`                            | `{ commentId }`                                          |
| `issue.attachmentAdded`                           | `{ attachment: { id, fileName, mediaType, size } }`      |
| `issue.attachmentRemoved`                         | `{ attachmentId }`                                       |

A plugin hears only of the issues of its projects, and never of what a plugin did, itself included: two plugins never answer each other forever. Events reach it a moment after the change, ten at a time, one after the other, each with **60 seconds**.

### Handled twice

When one event of a batch fails, the batch is tried again later, the events before it included. Whatever a handler does must bear being done twice: comment with `once: event.id`, and look for a record before creating it.

## Jobs

<<< @/../plugins/time-tracking/src/jobs/weekly-summary.job.ts{ts:line-numbers}

`plugin.defineJob({ name, every, label, handler })`:

- **`every`**: `'hour'`, `'day'` or `'week'`, counted from its last run. Toppo keeps no time zone to run it at an hour.
- **`label`**: what it does, among its messages, shown to who approves the plugin; 5 jobs at most.
- **60 seconds** a run. Like an event, a run may happen twice: what it does outside Toppo must bear it.

A job of a plugin no longer enabled, or no longer declaring it, runs no more.

## When they fail

An event or a job that fails is tried again later, with a longer wait each time. It counts once toward [disabling the plugin](./installing#when-it-keeps-failing), however many times it is tried.
