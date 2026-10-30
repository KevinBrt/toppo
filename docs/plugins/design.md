# Plugin system: design

Status: **agreed**. Its decisions are summed up in `ARCHITECTURE.md`, its steps tracked in `ROADMAP.md`. Every number below comes from a throwaway prototype, not kept in the repository, summarized in the appendix.

## Goal

Toppo's core covers what most teams need, complete from install: nobody should assemble thirty plugins to get a full tracker, so the kanban board, webhooks and the GitHub integration are built in. Plugins are for the rest: a feature specific to a team (time tracking, approvals, a report), a tool fewer teams use, an integration of one's own. Anyone can write one, and it can be a whole feature, with its data and its screens. Three requirements weigh on every choice:

- **Framed.** A plugin does what the administrator approved, and nothing else, even if its author means harm. Permissions are enforced, not declared.
- **Clean.** One contract, one way to do each thing, typed end to end. The reference plugin uses it without privilege.
- **Simple.** A plugin can be a single file. The SDK imposes no folder, no registration file, no boilerplate.

## Principles

1. **One contract.** A plugin imports only `@toppo-tracker/plugin-sdk` and `@toppo-tracker/plugin-ui` (MIT). It never reaches Toppo's database, files, configuration or network directly. What the SDK does not offer, a plugin cannot do.
2. **What the core's integrations build on, plugins share.** Webhooks and GitHub live in the core, on blocks plugins use too: the outbound HTTP guard, signed webhooks, routes that check a signature. GitLab or Bitbucket can then be plugins written with the same tools. The core never tests a plugin's id.
3. **Toppo's conventions.** An action is declared like a command (`access`, Zod `input`, `handler`), translations are typed in English and French, permissions join the same catalog.
4. **Everything declared.** What a plugin may do, store, show and reach is in its manifest, validated strictly when it is installed, shown to the administrator, and enforced at run time.
5. **A plugin never brings Toppo down.** Its memory and time are capped; a failing plugin is retried, then disabled, and the administrator is told.
6. **Stable.** The SDK follows semver: nothing breaks in a minor version; a break is a new major `apiVersion`, after a deprecation period.

## A plugin

A plugin is TypeScript built by `toppo plugin build` into one zip: a server bundle and a browser bundle per screen. Toppo derives its manifest from the code, which it runs in the sandbox when the zip is uploaded.

### The smallest: one file

```ts
// src/plugin.ts
import { definePlugin, z } from '@toppo-tracker/plugin-sdk';

export const plugin = definePlugin({
  id: 'slack',
  apiVersion: '^1.0',
  needs: ['issue.read'],
  http: ['hooks.slack.com'],
  settings: z.object({ webhookUrl: z.url() }),
  messages: { en: {}, fr: {} },
});

plugin.defineEventHandler({
  event: 'issue.created',
  async handler(ctx, { issue }) {
    await ctx.http.fetch(ctx.settings.webhookUrl, {
      method: 'POST',
      body: JSON.stringify({ text: `New issue ${issue.key}: ${issue.title}` }),
    });
  },
});
```

The administrator gets a settings form, a permission screen to approve, retries when Slack does not answer, and the plugin runs in its sandbox.

### A whole feature: time tracking

An example, split as Toppo splits its own code; an author may split it otherwise, or not at all.

```
src/
├── plugin.ts                          what the plugin is and may do
├── entities/time-entry.entity.ts
├── messages/en.messages.ts, fr.messages.ts
├── actions/log-time.action.ts
├── events/summarize-on-close.event.ts
├── pages/time-report.page.ts, issue.panel.ts
└── web/issue-panel.tsx, time-report-page.tsx, components/…
```

```ts
// src/entities/time-entry.entity.ts
export const timeEntry = defineEntity({
  attachedTo: 'issue',
  fields: z.object({
    minutes: z
      .int()
      .min(1)
      .max(24 * 60),
    spentOn: z.iso.date(),
    note: z.string().trim().max(500).optional(),
  }),
  indexes: ['spentOn'],
  limits: { perIssue: 1000 },
});

// src/plugin.ts
export const plugin = definePlugin({
  id: 'time-tracking',
  apiVersion: '^1.0',
  needs: ['issue.read', 'comment.create'],
  permissions: {
    'entries.log': { scope: 'project', label: 'permissions.log' },
    'reports.read': { scope: 'project', label: 'permissions.reportsRead' },
  },
  settings: z.object({
    maxMinutesPerDay: z
      .int()
      .min(60)
      .max(24 * 60)
      .default(10 * 60),
  }),
  entities: { timeEntry },
  messages: { en, fr },
});

// src/actions/log-time.action.ts
export const logTime = plugin.defineAction({
  name: 'timeEntry.log',
  access: { issue: 'issueId' },
  input: plugin.entities.timeEntry.fields.extend({ issueId: z.uuid() }),
  async handler(ctx, input) {
    const loggedThatDay = await ctx.entities.timeEntry.sum('minutes', {
      where: { createdBy: ctx.user.id, spentOn: input.spentOn },
    });
    const limit = ctx.settings.maxMinutesPerDay;
    if (loggedThatDay + input.minutes > limit) {
      throw ctx.fail('errors.dailyLimit', { limit });
    }
    return await ctx.entities.timeEntry.create(input);
  },
});

// src/events/summarize-on-close.event.ts
export const summarizeOnClose = plugin.defineEventHandler({
  event: 'issue.statusChanged',
  async handler(ctx, { event, issue }) {
    if (issue.closedAt === null) {
      return;
    }
    const total = await ctx.entities.timeEntry.sum('minutes', { where: { issueId: issue.id } });
    if (total > 0) {
      const text = ctx.t('comment.closedAfter', { duration: ctx.format.duration(total) });
      // An event may be handled twice: its id keeps the comment single.
      await ctx.issues.comment(issue.id, text, { once: event.id });
    }
  },
});
```

```tsx
// src/web/issue-panel.tsx: real React, in a sandboxed frame
import { DataTable, Stat, useList, usePanel, useSum, useT } from '@toppo-tracker/plugin-ui';
import { plugin } from '../plugin.ts';
import { TimeEntryForm } from './components/time-entry-form.tsx';

const { timeEntry } = plugin.entities;

export function IssuePanel() {
  const { issue } = usePanel('issue');
  const t = useT(plugin);
  const where = { issueId: issue.id };
  const entries = useList(timeEntry, {
    where,
    orderBy: 'spentOn',
    direction: 'desc',
    pageSize: 20,
  });
  const total = useSum(timeEntry, 'minutes', { where });
  return (
    <>
      <Stat label={t('panel.total')} value={total.data ?? 0} format="duration" />
      <TimeEntryForm issueId={issue.id} />
      <DataTable rows={entries.data?.items ?? []} columns={[/* … */]} />
    </>
  );
}
```

### Conventions

| Piece                             | Form                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The plugin                        | `definePlugin({ id, apiVersion, needs, permissions, http, settings, entities, properties, messages, resources })` |
| An entity                         | `defineEntity({ attachedTo, fields, indexes, limits })`                                                           |
| A property of issues              | `defineProperty({ name, type, display, writtenBy })`                                                              |
| An action                         | `plugin.defineAction({ name, access, input, handler })`                                                           |
| A reaction to an event            | `plugin.defineEventHandler({ event, handler })`                                                                   |
| A recurring job                   | `plugin.defineJob({ name, every, handler })`                                                                      |
| An inbound HTTP route (later)     | `plugin.defineRoute({ method, path, access, input, handler })`                                                    |
| A page                            | `plugin.definePage({ zone, path, params?, search?, access, title, nav?, component })`                             |
| A panel in one of Toppo's screens | `plugin.definePanel({ on, access, title, component })`                                                            |
| In the browser                    | React's conventions: `useX` hooks, PascalCase components                                                          |

- `define…` declares a piece Toppo must know, and always takes one object.
- What goes into the plugin's declaration is an imported function (`definePlugin`, `defineEntity`, `defineProperty`); what builds on the plugin is a method (`plugin.defineAction`), which gives a typed `ctx`.
- Plain data stays plain: a settings schema is a Zod object, translations are objects.
- The build finds every `plugin.define…` call in `src/`: there is no list to keep.
- Types flow from the objects themselves, never from strings or a registration file: `useList(timeEntry)`, `useAction(logTime)`, `usePageParams(timeEntryPage)`. In the prototype, 18 mistakes an author could make (an unknown entity, field, setting, message key, permission or page parameter, a wrong input type, a missing French key…) were all refused by TypeScript, across files that import each other in cycles, in 0.12 s.
- An error the user sees comes from the context, `throw ctx.fail('errors.dailyLimit', { limit })`, so that its code is checked against the plugin's messages and translated.

## Permissions

Two different things, never mixed:

- **`needs`**: the core permissions the plugin itself uses (`issue.read`, `comment.create`…). The administrator approves them when enabling the plugin. They are its ceiling.
- **`permissions`**: new permissions the plugin adds to the same catalog as Toppo's. They appear in **Roles and permissions**, in a section named after the plugin, and administrators give them to roles like any other.

Rules:

- In the plugin, a permission has its short name (`'reports.read'`), typed. In the catalog, Toppo prefixes it with the plugin's id: `time-tracking.reports.read`. A plugin id may not be a core resource (`issue`, `project`, `instance`, `comment`…).
- `scope` as in the core: `instance` or `project`.
- New permissions go to the system role only (`grantsAll`, which already holds "every permission, now and to come"). A plugin may suggest more (`suggestedFor: ['team']`): the administrator sees the box ticked when enabling it and confirms; nothing is granted without them.
- `systemOnly: true` keeps a permission to the system role for good, as in the core: for what reaches beyond the instance.
- Whoever acts through a plugin holds **both** sides: an action run for a user needs the user's access (`access`) and the plugin's `needs`. A plugin never gives anyone more than they have.
- The SDK never exposes role names: "a permission, never a role name" holds by construction.
- Each plugin has a user of its own (`users.plugin_slug`), which cannot sign in and has an address under `.invalid`, kept out of member lists, mentions and assignment. What the plugin writes (a comment, an activity) is written by that user, so it shows as written by the plugin.
- Installing, enabling, configuring and removing plugins is a new core permission, `instance.plugins.manage`, `systemOnly`: it runs code and chooses outgoing addresses.

## Data: entities

A plugin stores its data as **entities**, declared with Zod and kept by Toppo.

- `attachedTo: 'issue' | 'project'`: who sees the record follows who sees its issue or project, in every query, sums included ("derived data follows the visibility of its source"). Deleting the issue or project deletes its records; backups and restores include them.
- `attachedTo: 'person'` (API 1.1): what is someone's own, a collection or a level. Acting for someone, the plugin writes theirs only; it reads theirs, or, with `visibleTo: 'teammates'`, those of the people who share a project with them where it acts. Erasing the person deletes their records.
- Toppo adds `id` (UUID v7), `createdBy`, `createdAt`, `updatedAt` to every record.
- Queries: `get`, `list` (filter, sort, page of at most 100), `count` and `sum`, by group with `countBy` and `sumBy` (an issue, a project, a person, an author or an indexed field), `create`, `update`, `delete`. No SQL.
- Records are filtered (a value, one of a list, bounds), sorted and grouped on their issue, project, person and author, and on the fields their entity `indexes`, those only.
- **Toppo validates every write itself.** The manifest carries each entity's schema as JSON Schema (`z.toJSONSchema`), within a subset (flat fields, bounded texts); Toppo builds its own validator from it, never running a pattern the plugin wrote, and does not trust the plugin's own validation. `limits` bound what users can grow, with defaults when absent.
- No plugin schema, table or migration, ever.

**Storage.** One table, `plugin_records`, created by a normal migration: plugin, entity, project, issue, person, author, timestamps, `data jsonb` holding every field, and **typed slots** for the fields a plugin filters or sorts on: three dates, three numbers, three texts and two references (a person's or an issue's id). The project, the issue and the author have their own columns already. When a plugin is installed, Toppo assigns a slot to each field in its `indexes` (`plugin_record_slots`) and copies the value there on every write: a date at midnight UTC, a moment, a number, a text of 200 characters at most or a choice, an id. Each slot has two static partial indexes (`WHERE slot IS NOT NULL`), after the project and after the author; an issue holds few enough records to be read whole. An indexed field is one every record has (required, or given a default), so that sorting or grouping on it leaves none out. An entity may declare at most as many indexes as there are slots of each type; its other fields are unlimited, only not indexed. A field keeps its slot while it stays as declared; when an upgrade adds an index, or changes an indexed field, a job fills its slot a batch at a time, and queries read the field from the records' data meanwhile.

Measured on PostgreSQL 18, among 400,000 rows of another plugin, every query scoped to the 5 projects of 20 a user sees:

| Median, ms                        | 100k entries, anchors only | 1M, anchors only | 1M, slots |
| --------------------------------- | -------------------------- | ---------------- | --------- |
| An issue's last 20 entries        | 1.45                       | 1.79             | 1.00      |
| A person's minutes on one day     | 1.69                       | 71.91            | 0.96      |
| A project's month, by person      | 1.84                       | 72.19            | 2.35      |
| A person's newest 50              | 2.02                       | 81.39            | 1.62      |
| A year, by project (125,000 rows) | 7.71                       | 70.07            | 36.37     |

Expression indexes built per plugin at install read as fast as the slots, but need SQL written at run time; the slots need none. Writes: 1.6 ms per insert (4 writers, one transaction each), plus 0.3 ms with 30 partial slot indexes. Large sums will want covering indexes or totals kept by Toppo.

When a plugin is uninstalled, the administrator chooses: keep its data (it comes back if the plugin is reinstalled) or delete it.

## Properties

A plugin may add **properties** to issues, which then behave as any other: a column of the issue list, a filter, a sort, a grouping, shown or hidden project by project. For instance an estimate people type in, and the time spent it computes (time tracking writes the latter, counted again from all of an issue's entries each time one is logged):

```ts
export const estimate = defineProperty({
  name: 'properties.estimate',
  type: 'number',
  display: 'duration',
  writtenBy: 'people',
});

export const timeSpent = defineProperty({
  name: 'properties.timeSpent',
  type: 'number',
  display: 'duration',
  writtenBy: 'plugin',
});

// definePlugin({ …, properties: { estimate, timeSpent } }), then, in the action that logs time:
await ctx.issues.setProperty(input.issueId, 'timeSpent', total);
```

- A number, a text, a date or a box: the core's types but those with options or people, which would need options a plugin declares. `display` formats a number: `duration` shows minutes as "6 h 40".
- `writtenBy: 'people'`: typed in like any property. Changing it takes `issue.update` and records an activity, as usual. The plugin reads it on the issue (`ctx.issues.get(id).properties`), as it reads its own others.
- `writtenBy: 'plugin'`: only the plugin writes it, on issues it, and whoever it acts for, sees; everyone else reads it. Writing its own property takes no `needs`, though a plugin with properties needs `issue.read`. **It records no activity**: it is derived data, like a count, whose history is the plugin's own records. Recording it would fill the issue's history at every change and, through `issue.propertyChanged`, let plugins answer each other in loops.
- Stored where the core's properties are (`issues.properties`, and the `properties` table with the plugin as owner), so the issue list, its filters and its sorts work unchanged. They show in the projects where the plugin acts, while it is enabled.
- Its name is data, as for every property: written when the plugin is approved, from its messages, in the language of whoever approves it, then renamed at will. If a property already has that name, the plugin's name follows it: "Estimate (Time tracking)".
- The administrator adapts it like any property (shown in the list, hidden in a project; asked at creation when people write it), but cannot delete it while the plugin is installed. Its type, and who writes it, never change: a version that would is refused.
- At most 5 per plugin, among the instance's 20. A version adding one is approved again; one dropping one leaves it hidden with its values, until a version declares it again. When the plugin is uninstalled, they follow the administrator's choice: kept hidden with their values, or deleted (what people typed told in each issue's history).

## Events, actions, jobs and routes

- **Events are Toppo's activity types**, one vocabulary: `issue.created`, `issue.statusChanged`, `issue.commented`… (`ISSUE_ACTIVITY_PAYLOADS`). A handler receives the event (id, type, time, actor), the change, and the issue as the plugin may see it (`closedAt` included). The job each recorded activity queues fans out one job per subscribed plugin, so a slow or failing plugin is retried alone, with backoff, and never delays the change itself. A job may run twice: `{ once: event.id }` makes the plugin's writes single. Changes made in bulk and recorded without telling people (`notify: false`) reach plugins too, in batches: a label removed from 10,000 issues stays bounded work.
- **Actions** are what a plugin's screens call. Toppo checks `access` (a 404 for an issue the user cannot see, as for routes), validates `input`, then runs the handler under a deadline. They answer at most a small result, like a command.
- **Jobs** (`every`: `'hour'`, `'day'` or `'week'`, from their last run, since Toppo keeps no time zone) run through Toppo's job queue, one per instance whatever the number of servers, as the plugin itself, under a minute each.
- **Routes**, `POST /api/v1/plugins/<id>/routes/<name>`, for services calling the plugin (a GitHub webhook). Public: the plugin checks the request is the service's with `ctx.crypto.verify`, Toppo's computation, given the body as it came; Toppo bounds what comes in and goes out, and how often. Built before the core's GitHub integration, which will check its signatures with the same code.

## Where the server code runs

A plugin's server code runs in **QuickJS compiled to WebAssembly**, one instance per plugin, in a worker thread.

- The sandbox holds JavaScript and nothing else: no `process`, `require`, `fetch`, timers, files, sockets or module loader. Its one door is the `ctx` Toppo gives it, and every call through it is checked.
- **Memory**: each plugin gets its own `WebAssembly.Memory` with a fixed maximum. The engine refuses to grow past it; a greedy plugin ends in "out of memory" inside its sandbox. QuickJS's own memory limit is not enough: in the prototype, large strings and arrays went past it to 2 GB, and runtimes sharing one WebAssembly memory starved each other.
- **Time**: QuickJS's interrupt handler stops a run at its deadline, including work inside built-ins (a catastrophic regular expression, a huge sort).
- **Defaults**: 128 MB of memory; 5 s for an action (someone is waiting), 10 s for a route, 60 s for an event or a job. A plugin that needs more declares it (`resources: { memoryMb: 512 }`); the administrator sees it and approves it with the rest, within maximums Toppo sets.
- **Responsiveness**: the worker thread keeps Toppo answering requests while a plugin computes.
- Speed in the prototype: a plugin loads in 30 to 60 ms; an action that validates its input with Zod and makes two calls to Toppo runs in 0.16 ms.
- **For authors**: plugins are written as above, unchanged. Pure JavaScript npm packages work (Zod does); packages that need Node's APIs do not. The SDK loads Zod once, so plugins leave it out of their bundle.

A Node process with the permission model was tried first and is not enough: Node 24 cannot close the network, a plugin can signal Toppo's process, and Node's documentation says the model "does not provide security guarantees in the presence of malicious code".

## Outbound HTTP and secrets

`ctx.http.fetch` has the shape of `fetch`. A plugin declares what it may reach:

| Declaration                       | For                                                | The administrator sees                                   |
| --------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `http: ['hooks.slack.com']`       | a known service                                    | "Can reach hooks.slack.com"                              |
| `http: { fromSettings: ['url'] }` | an address the administrator types in its settings | "Can reach the address in its settings (now: https://…)" |
| `http: 'any'`                     | addresses that are data (a webhook per project)    | ⚠ "Can reach any public site"                            |

The settings named are text settings of the instance's; the request may go to the host of what they hold now. Whatever the declaration, Toppo enforces, in a guard of the core (`platform/http/outbound/`), built once for the core's webhooks and GitHub integration and for plugins:

- **No internal address**: loopback, private networks, link-local (the cloud metadata address `169.254.169.254`), carriers' NAT, multicast, reserved ranges, IPv6's own and the IPv4 an IPv6 address carries, checked as the connection resolves the host, which then goes to the very address checked, and again on each redirect. The approval may name hosts inside the network a plugin reaches (a team's own chat), ten at most.
- 10 seconds in all, 256 KB of answer, 64 KB sent, five redirects, no cookies, 60 requests a minute per plugin.
- A log of the plugin's last 50 requests and how each went, by host, on its admin page: never their path, query or body.
- A request that gets no answer rejects with an `HttpFailure` and its code; an answer, whatever its status, is not one.

Settings may hold secrets: `secret(z.url())` marks a text of the instance's, without a default, that Toppo seals with its instance key (`services.secrets`), never shows again, and gives only to the plugin's sandbox: its form says whether it holds one, keeps it when left empty, and removes it when asked. `ctx.crypto`, later with routes, offers what plugins need without Node: HMAC signatures, constant-time comparison, random ids.

## The interface

### Screens: React in a sandboxed frame

A plugin's panels and pages are **real React**, bundled by the build, shown in an `<iframe sandbox="allow-scripts allow-forms">` served by Toppo under a CSP of its own:

```
sandbox allow-scripts allow-forms; default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' data:; font-src data:; connect-src 'none'; form-action 'none';
base-uri 'none'; frame-src 'none'; frame-ancestors 'self'
```

`allow-forms` lets a screen's forms submit to its own code (`form-action 'none'` keeps them from going anywhere).

- The frame has no origin: it cannot read Toppo's page, the user's cookies or storage, call Toppo's API or any site, open windows or navigate the tab. Its only way out is the bridge (`postMessage`), checked by Toppo like a request from the browser.
- It can navigate itself, though, and carry what it shows in an address: Toppo answers a frame only while it holds the document Toppo served (origin `'null'`), and takes away a frame that loads another one.
- Toppo's own CSP stays as strict as today.
- `@toppo-tracker/plugin-ui` (MIT) gives Toppo's components, its theme, the user's language, and hooks built on TanStack Query: `useActionQuery`, `useActionMutation`, `useScreen` (the user, the issue or project shown, the page's search, `open()`), `usePeople`, `useT`, `formatDuration`. It holds only types and relays: their code is Toppo's runtime (`packages/plugin-runtime`, AGPL), which Toppo serves in the frame before the plugin's bundle, with one React for every plugin. Plain HTML, CSS and any bundled React library work too; then accessibility and phone widths are the author's to keep.
- A screen reads and writes through its plugin's actions only: `useActionQuery(listEntries, { issueId })` imports the action into the browser bundle, whose build leaves out the handlers of actions and event handlers, so server code never reaches the browser. `useActionMutation` checks the input with the action's own schema before sending it, then asks again what the screen shows.
- Found in the prototype: the bundle must be a classic script (an origin-less frame refuses module scripts; never answer that with `Access-Control-Allow-Origin: null`); the frame is sized to its content's height, which the frame reports. A screen with React weighs 220 KB minified; Toppo serves one shared React runtime so plugins leave it out.

Components, with props of their own that stay stable whatever `packages/ui` becomes:

| Kind                                       | Components                                                                                                                                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First version (step 3), from `packages/ui` | Button, Badge, Alert, EmptyState, Field, Input, Textarea, Select, Switch                                                                                                                                                          |
| First version (step 3), added for plugins  | Page (its one title, actions), Section, Stat, Table (rows given by the screen, a page at a time), DurationInput, PersonName (from an id), IssueLink, PageLink                                                                     |
| Next, as plugins need them                 | Avatar, StatusBadge, PriorityIcon, BadgeSelect, SortableList, Tabs, DataTable (sorted and paged by the server), DateInput, NumberInput                                                                                            |
| Step 3, opened by Toppo outside the frame  | A confirmation (`useConfirm`), Menu, the plugin's dialogs and side panels (`defineDialog`, `useDialog`), searches of issues and people (`usePickIssue`, `usePickPeople`: only what the user sees): a frame cuts what overflows it |
| Step 3, charts                             | BarChart (with limits), LineChart, Meter                                                                                                                                                                                          |
| Later                                      | A board of draggable columns                                                                                                                                                                                                      |

### Where a plugin shows

Small contributions are data, drawn by Toppo in its own page: a menu entry, a label, an icon from Toppo's set (Lucide).

| Zone               | Where                                                                   | URL of its pages               |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------ |
| `main`             | the main sidebar, under Toppo's entries                                 | `/p/<plugin>/…`                |
| `settings`         | the settings sidebar: a section named after the plugin                  | `/settings/p/<plugin>/…`       |
| `project.settings` | a tab in a project's settings, in a section named after the plugin      | `/projects/<key>/p/<plugin>/…` |
| `project`, next    | a project's home page (new: it shows the project's latest activity)     | (chosen with that page)        |
| panels             | `issue`: a panel on the issue page, under its title, before the history | (none)                         |

A project's settings live at `/projects/<key>`, so their plugin tabs do too. The `project` zone waits for a project's home page, which Toppo does not have yet.

- A plugin never sits between the core's entries, reorders them or takes a core URL: its URLs start with its id.
- In the settings sidebar, each plugin with settings pages gets **its own section**, after the core's; its generated settings form stays on its page in Settings → Plugins. A plugin shows at most 8 entries in a zone, 20 pages and 5 panels in all; an entry's icon is one of 16 of Toppo's set.
- A page's `access` protects the page and decides who sees its link: they cannot diverge. Toppo checks it before serving the frame; without it, a 404.
- In the first version, a page has a name and a search kept in Toppo's address (20 short terms at most), and one entry at most. Next, pages take typed parameters, TanStack Router's way (`/entries/$entryId`). A page whose parameter is an enum may list one entry per value: an imports plugin shows Mantis, Redmine and Jira as three entries of one page. Entries are declared in code, never made from data: what a plugin adds to the interface is known when it is approved.

```ts
export const sourcePage = plugin.definePage({
  zone: 'settings',
  path: '/$source',
  params: z.object({ source: z.enum(['mantis', 'redmine', 'jira']) }),
  access: { permission: 'imports.run' },
  title: 'source.title',
  nav: [
    { params: { source: 'mantis' }, label: 'sources.mantis', icon: 'database' },
    { params: { source: 'redmine' }, label: 'sources.redmine', icon: 'database' },
    { params: { source: 'jira' }, label: 'sources.jira', icon: 'database' },
  ],
  component: () => import('../web/source-page.tsx').then((m) => m.SourcePage),
});
```

## Installing and lifecycle

- **Package**: `toppo plugin build` writes a zip: the server bundle, the browser bundles and their assets. It holds no manifest a person writes: Toppo runs the server bundle in the sandbox and asks it what it declares, so a package cannot claim less than it does. Packages are kept in the data volume (`/data/plugins/`), their sha256 in the database.
- **Install**: an administrator uploads the zip in **Settings → Plugins**. Toppo checks it before anything runs: size limits, file types, no links or paths leaving the archive, a strict manifest (unknown keys refused), a compatible `apiVersion` (or a clear message). It shows the package's hash.
- **Approve**: the screen lists what the plugin needs, adds, stores, shows and reaches, the resources it asks beyond the defaults, and the projects it applies to. The administrator confirms, with the suggested grants of its permissions.
- **Upgrade**: a new version asking for more is approved again; otherwise it replaces the old one. A new index fills its slot in a job.
- **Disable**, then **uninstall**: keep or delete its data.
- Each step is recorded. A plugin that keeps failing is disabled and the administrator told.
- A catalog may come later (v2).

## Security model

| Layer                                                   | Holds against                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| QuickJS in WebAssembly, `ctx` the only door             | Files, network, processes, Toppo's memory and secrets             |
| A capped `WebAssembly.Memory` per plugin                | Memory exhaustion, one plugin starving another                    |
| QuickJS's interrupt handler, a worker thread per plugin | Endless work; Toppo stopping to answer                            |
| Toppo validating writes from the manifest's schemas     | A plugin skipping its own validation                              |
| Access checked on every call, user and plugin           | A plugin acting beyond its approval or for someone beyond theirs  |
| The outbound guard                                      | Requests to the internal network, to undeclared hosts             |
| The sandboxed frame, `connect-src 'none'`               | Screens reaching the user's session, Toppo's page or the network  |
| `instance.plugins.manage`, `systemOnly`                 | Anyone but an administrator installing code or choosing addresses |

The plugin's author is not trusted; the administrator who installs it is, for the approval they give. The whole system gets a security review of its own before it ships, as `ROADMAP.md` asks.

## For authors

- `npm create @toppo-tracker/plugin`: a plugin ready to build and test.
- `toppo plugin dev`: runs it against a local Toppo, reloading on change.
- `toppo plugin build`: the zip to install.
- `@toppo-tracker/plugin-testing`: a fake Toppo to test a plugin without an instance (`createTestToppo(plugin)`, users who see given issues, `user.run(logTime, input)`).
- Documentation in `docs/plugins/`, with a worked example.

## Packages and official plugins

The published packages live under the npm scope `@toppo-tracker` (the GitHub organization of the same name is Toppo's too; `@toppo` belongs to someone else):

| Package                         | For                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `@toppo-tracker/plugin-sdk`     | `definePlugin`, `defineEntity`, `defineProperty`: the contract                   |
| `@toppo-tracker/plugin-ui`      | components and hooks for a plugin's screens                                      |
| `@toppo-tracker/plugin-testing` | the fake Toppo to test a plugin                                                  |
| `@toppo-tracker/cli`            | the `toppo` command: `toppo plugin build`, `toppo plugin dev`; other tools later |
| `@toppo-tracker/create-plugin`  | `npm create @toppo-tracker/plugin`                                               |

- MIT, versioned by semver along `apiVersion`, published to npm with provenance by GitHub Actions once the contract is complete: data and screens included (steps 1 to 3). Until then they stay private.
- `plugin-ui` is a facade: it bundles the components of `packages/ui` it chooses to expose, under an API kept stable. `packages/ui` stays private and free to change, as `core` stays private behind `plugin-sdk`.
- Toppo's internal packages (`@toppo-tracker/core`, `@toppo-tracker/ui`…) were renamed from `@toppo/…` before the SDK: one scope in the repository, and no internal name in a scope someone else owns. They stay private.

**Official plugins** live in this repository, under `plugins/` (time tracking first), without privilege: they import only the published packages, by name; the same CLI builds them; an end-to-end test installs one through the interface, approval included. They are not in Toppo's image: an administrator installs one from its zip in **Settings → Plugins**, with the same approval as any other. Each has its own version, raised when it changes: an administrator is offered an upgrade only when there is something new.

## What changes in the core

- Tables: `plugins` (id, version, state, approved needs and hosts, settings with sealed secrets, hash), `plugin_records` (entities), and their slots' assignments.
- `users.plugin_slug`: each plugin's own user.
- `properties` gains its owning plugin and who writes it; a number property may be displayed as a duration.
- The rule "every issue change writes an `activities` row" (`CLAUDE.md`) gains its one exception: a property a plugin computes is derived data and records no activity.
- The permission catalog accepts plugins' permissions next to the core's typed ones; roles keep storing them as text.
- `instance.plugins.manage` (`systemOnly`).
- The job of each recorded activity fans out to subscribed plugins.
- The outbound HTTP guard in `platform/http/`, shared with the core's webhooks and GitHub integration.
- A project home page with its latest activity, which is also the `project` zone.
- The sandbox runtime (`platform/plugins/`): loading packages, workers, QuickJS, the `ctx` calls, the frame host and its bridge.
- Internal packages renamed `@toppo-tracker/…`; the release workflow publishes the plugin packages to npm.
- `ARCHITECTURE.md`: its "Plugin system" section is replaced by this design's decisions; the plugins row of its data model is updated.

## Steps

The core's own features do not go through the SDK, so a **reference plugin**, kept in this repository (`plugins/time-tracking`) and tested in CI, uses every part of it: **time tracking**. Each step ends with it using what the step adds, and with its own tests (a test per SDK operation that refuses it without the permission, generated like `route-permissions.test.ts`). The kanban board, webhooks and the GitHub integration follow their own roadmap in the core; the outbound guard, signed webhooks and signature-checked routes are built once, for them and for plugins.

1. **Foundations**: packages, upload and validation, approval, the sandbox runtime and its resources, `needs` and `permissions` in the catalog, settings and secrets, actions, event handlers, `ctx.issues`, the CLI and testing kit. _Time tracking: its name, logo and permission, the hours of a working day in its settings (8 by default), an action that checks an entry without storing it yet, built with the CLI, installed and set up through the interface in an end-to-end test._
2. **Data**: entities (`plugin_records`, slots, queries, limits, uninstall choices) and properties. _Time tracking: time entries, the time spent on each issue as a property, and a budget in days that each project may set for itself, in project settings plugins declare. The budget refuses nothing._
3. **Interface**: the frame host and its bridge, `@toppo-tracker/plugin-ui`, pages, panels, zones, the project home page. _Time tracking: the issue panel, and a page across the projects it acts in, filtered by project: the days spent against each project's budget, those over it marked, the time of closed issues apart from that of issues in progress or to come._
4. **Beyond the instance**: the outbound guard and `ctx.http`, secrets, recurring jobs. _Time tracking: each week, the time of the week by project against its budget, sent to a chat whose webhook is a secret of its settings._ Then routes and `ctx.crypto`, before the core's GitHub integration, tested with a plugin of the tests (`commit-links`), since time tracking receives nothing from outside.
5. **Imports**, if they become a plugin: an `issue.import` capability (`systemOnly`: issues with their original dates, authors and history).

## Open questions

- Core or plugin: Slack, Teams or Discord notifications; GitLab; imports from Mantis, Redmine and Jira.
- Covering indexes, or totals kept by Toppo, for large sums over entities.

## Appendix: the prototype

Throwaway code, not kept in the repository. Node 24.22, PostgreSQL 18, Chromium through Playwright.

- **Node process with the permission model**: files, programs, workers and addons blocked; network and signals to the parent allowed. Rejected as a boundary.
- **Sandboxed frame**: React renders and reacts; the bridge works both ways; every escape tried was blocked by the sandbox or the frame's CSP; the server never saw a request from the frame carrying the session.
- **Types**: the time tracking plugin across files type-checks with no registration; 18 deliberate mistakes refused.
- **QuickJS in WebAssembly** (`quickjs-emscripten-core`, MIT): the time tracking plugin's own files ran unchanged; interrupts hold, including inside built-ins; memory holds only with a capped `WebAssembly.Memory` per plugin.
- **Entities**: the table above; typed slots chosen over per-plugin expression indexes.
