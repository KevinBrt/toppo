# Records and properties

## Entities

A plugin keeps what it needs as records of its **entities**, on an issue, on a project or on a person. Toppo stores them and checks every write itself, from what the entity declares, never from the plugin's code.

<<< @/../plugins/time-tracking/src/entities/time-entry.entity.ts

`defineEntity({ attachedTo, fields, indexes?, limits? })`, then `entities: { timeEntry }` in `definePlugin()`; 10 entities at most.

- **`attachedTo`**: `'issue'` (takes `issue.read`), `'project'` or `'person'` (takes `apiVersion: '^1.1'`). A record on an issue or a project is seen as its issue or project is.
- **`visibleTo`**, for an entity on people: who sees a person's records when the plugin acts for someone. `'person'` (the default): that person alone. `'teammates'`: anyone who works with them in a project the plugin acts in too, for a collection colleagues compare.
- **`fields`**: a flat Zod object, 30 fields at most: a text with its `.max()` (10,000 at most), a known format (`z.iso.date()`, `z.iso.datetime()`, `z.uuid()`, `z.email()`), a choice (`z.enum()`), a number with its bounds, a yes or no. Nothing nullable or nested; `.optional()` and `.default()` are fine. 16 KB a record.
- **`indexes`**: the fields it filters, sorts and groups records by. Each must be required or have a default: three dates, three numbers, three texts (a choice, an email, or 200 characters at most) and two ids at most.
- **`limits`**: `{ perIssue }` (1,000 by default, 10,000 at most), `{ perProject }` (100,000 by default, 1,000,000 at most) or `{ perPerson }` (1,000 by default, 10,000 at most). Past it, a write is refused with `RECORD_LIMIT_REACHED`.

### Reading and writing

`ctx.entities.<name>` takes no need:

| Call                                                  | Answers                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `create({ ...fields, issueId })`                      | The record (`projectId` on projects, `personId` on people)  |
| `get(id)`                                             | The record, or `null`                                       |
| `update(id, changes)`, `delete(id)`                   | The record; nothing                                         |
| `list({ where, orderBy, direction, page, pageSize })` | `{ items, total }`, 50 a page, 100 at most                  |
| `count({ where })`, `sum(field, { where })`           | A number                                                    |
| `countBy(group, …)`, `sumBy(field, group, …)`         | `[{ key, value }]`, the largest first, 1,000 groups at most |

A record reads as `{ id, issueId, projectId, personId, createdBy, createdAt, updatedAt, ...fields }`. `createdBy` is the person an action runs for, or the plugin's own user.

- **`where`** filters by `issueId`, `projectId`, `personId`, `createdBy` and the indexed fields: a value, `{ in: [...] }`, or a range `{ gte, lt… }`.
- **`orderBy`** and **groups** take `createdAt` or an indexed field (groups: `issueId`, `projectId`, `personId`, `createdBy` too).

Acting for a person, the plugin sees only the records of what that person sees, and of people as their entity's `visibleTo` says.

### On a person

A record on a person hangs on someone who works in a project the plugin acts in: never a plugin's own user, nor anyone else (`PERSON_NOT_FOUND`). Acting for someone, an action writes, changes and deletes that person's records only, even those their teammates see (`FORBIDDEN` for another). As itself, an event handler, a job or a route writes those of any of these people: the one who closed an issue is `event.actorId`. Erasing a person deletes their records. In an archived project, records are read-only. Uninstalling the plugin keeps them, to be found again if it comes back, or deletes them, as the administrator chooses.

## Properties

A plugin adds fields to issues: Toppo's own properties, shown, filtered and sorted with the others.

<<< @/../plugins/time-tracking/src/properties/time-spent.property.ts

`defineProperty({ name, type, display?, writtenBy })`, then `properties: { timeSpent }` in `definePlugin()`; 5 at most, and they take `issue.read`.

- **`type`**: `'number'` (shown as a duration with `display: 'duration'`, in minutes), `'text'`, `'date'` or `'checkbox'`. It never changes.
- **`writtenBy: 'people'`**: people fill it, as any property.
- **`writtenBy: 'plugin'`**: the plugin alone writes it, with `ctx.issues.setProperty(issueId, 'timeSpent', 90)`; `null`, or `false` for a box, takes it away. It records no activity and fires no event: its history is the plugin's own records.

They are created as the plugin is approved, named by its messages in the approver's language, among the instance's 20 properties. They show in its projects while it is enabled.
