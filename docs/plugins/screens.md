# Screens

A plugin's screens are React components, in `.tsx` files, drawn with Toppo's components: they look like Toppo, in the person's language, and reach their plugin through its actions only.

## Pages and panels

<<< @/../plugins/time-tracking/src/screens/time-report.page.ts

<<< @/../plugins/time-tracking/src/screens/issue-time.panel.ts

`plugin.definePage({ name, zone, access, title, nav?, component })` places a page:

| `zone`               | Where it shows                                               |
| -------------------- | ------------------------------------------------------------ |
| `'main'`             | In the main sidebar, with `nav: { label, icon }`             |
| `'settings'`         | In Settings, in a section named after the plugin             |
| `'project.settings'` | As a tab of a project's settings, in the projects it acts in |

`plugin.definePanel({ name, on: 'issue', access, title, component })` shows a panel on the issue page, under its title, in the projects the plugin acts in; it takes `issue.read`.

- **`access`**: `'authenticated'` or `{ permission }`, one of the plugin's or one of its needs. For a project's tab or an issue's panel, it is checked in that project. Who may not open a screen does not see its entry either.
- **`title`**, **`nav.label`**: keys of its messages. **`nav.icon`**: `bar-chart`, `briefcase`, `calendar`, `clock`, `database`, `file-text`, `flag`, `folder`, `gauge`, `list`, `puzzle`, `settings`, `tag`, `timer`, `users` or `wallet`.
- **`component`**: `() => import('../web/x.tsx').then((module) => module.X)`, so that its code is in the screens' bundle only.

20 pages and 5 panels at most, 8 entries per sidebar zone.

## Drawing a screen

```tsx
import {
  Page,
  Stack,
  Stat,
  Table,
  useActionQuery,
  useScreen,
  useT,
} from '@toppo-tracker/plugin-ui';
import { listEntries } from '../actions/list-entries.action.ts';
import { plugin } from '../plugin.ts';

export function IssueTimePanel() {
  const t = useT(plugin);
  const { issue } = useScreen();
  const entries = useActionQuery(
    listEntries,
    { issueId: issue?.id ?? '' },
    { enabled: issue !== null },
  );
  return (
    <Stack>
      <Stat label={t('panels.issueTime.total')} value={entries.data?.total ?? 0} />…
    </Stack>
  );
}
```

`@toppo-tracker/plugin-ui` gives:

| Components                                                                  | For                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Page`, `Section`                                                           | A page's frame and its one title; a titled part of it                      |
| `Stack`, `Row`                                                              | Layout: one under the other, or side by side, with a `gap`                 |
| `Table`, `Stat`, `Badge`, `Alert`, `EmptyState`                             | Showing                                                                    |
| `Field`, `Input`, `Textarea`, `Select`, `Switch`, `DurationInput`, `Button` | Forms: `Field` labels its control and ties its description and error to it |
| `PersonName`, `IssueLink`, `PageLink`                                       | Someone by their name; an issue or another of its pages, opened in Toppo   |

| Hooks                                        | Answer                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `useActionQuery(action, input, { enabled })` | `{ data, error, isLoading, refetch }`: an action's answer, asked as the screen shows                               |
| `useActionMutation(action)`                  | `{ run, isPending, error }`: `run` checks the input with the action's schema, runs it, then asks every query again |
| `useScreen()`                                | `{ locale, user, issue, project, search, setSearch, open }`                                                        |
| `useT(plugin)`                               | `t(key, params?)`, the plugin's messages in the person's language                                                  |
| `usePeople(ids)`                             | Their names, `null` for someone the person may not see                                                             |

A failed action's `error` is a `ScreenError`: its `code` is the plugin's own message key (`ctx.fail`), or one of Toppo's (`FORBIDDEN`, `VALIDATION_FAILED` with its `issues`). `setSearch` keeps a page's choices in Toppo's address, so that it can be shared; `open` opens an issue or another of its pages.

## Charts

| Component                            | Shows                                                                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<BarChart title bars format? />`    | A figure per thing, as bars across. `bars`: `{ key, label, value, limit? }`; a limit (a budget) is marked across its bar, and passing it is said in words |
| `<LineChart title points format? />` | A figure over time, as a line. `points`: `{ key, label, value }`, in order; hovering, or the arrow keys, read each point                                  |
| `<Meter label value max format? />`  | A figure against its most: the days spent against a budget                                                                                                |

`format` writes each value, as `(days) => t('days', { days })`. Each is drawn in Toppo's colors, and told to screen readers as a table (a `meter` for `Meter`). The time report draws each project's days against its budget with a `BarChart`.

## Dialogs

<<< @/../plugins/time-tracking/src/screens/log-time.dialog.ts

`plugin.defineDialog({ name, access, title, component, input, result?, size?, side? })` declares a screen that another of its screens opens over the page: Toppo's dialog, under its `title` and its plugin's name, holds it in a frame of its own.

- **`input`**: the schema of what the screen that opens it hands it, 4 KB of JSON at most.
- **`result`**: the schema of what it closes with, 16 KB at most. Without it, it closes with nothing.
- **`size`**: `'small'`, `'medium'` (the default) or `'large'`. **`side: true`** opens it at the side of the page, rather than in its middle.
- **`access`**: as a page's, checked as it opens.

10 dialogs at most, named apart from the plugin's pages and panels. The screen that opens it:

<<< @/../plugins/time-tracking/src/web/time-report-page.tsx#log-time

And the dialog's own screen, which reads what it was opened with, then closes:

<<< @/../plugins/time-tracking/src/web/log-time-dialog.tsx#dialog

| Hooks                    | Answer                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `useDialog(dialog)`      | `{ open(input) }`: what the dialog closed with, read by its `result` schema; `undefined` when the person dismissed it |
| `useDialogInput(dialog)` | In the dialog, what it was opened with, read by its `input` schema                                                    |
| `useCloseDialog(dialog)` | In the dialog, `close(result)`: its opener is answered `result`, checked by the `result` schema first                 |

Escape, Toppo's close button or a click outside dismiss it. A dialog does not open another dialog.

## What Toppo draws over the page

Some things a frame draws badly: what overflows it, what the person must tell apart from the plugin's own words. A screen asks Toppo to draw them, and each says which plugin asked:

| Hook or component               | Draws                                                                                                                               | Answers                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `useConfirm()`                  | `confirm({ title, description?, confirmLabel?, tone? })`: a confirmation; `tone: 'danger'` for what cannot be undone                | `true` once confirmed, `false` otherwise                                 |
| `<Menu label items onSelect />` | A button, and its menu beside it, never cut by the frame. `items`: `{ id, label, tone?, disabled? }`, 20 at most                    | `onSelect(id)`                                                           |
| `usePickIssue()`                | `pick({ projectId? })`: Toppo's search of the issues the person sees, in the projects the plugin acts in. It takes `issue.read`     | `{ id, key, title, projectId, projectKey }`, or `null`                   |
| `usePickPeople()`               | `pick({ projectId?, multiple? })`: Toppo's search of the people of a project the plugin acts in, whose every issue the person reads | Those picked, `{ id, name }[]`: one unless `multiple`, none if dismissed |

Toppo searches: the screen learns only what the person picked. It draws one thing at a time per screen, for the screen the person is using only, then gives focus back beside the screen: it draws another once the person uses the screen again. Asked otherwise, it refuses with `OVERLAY_REFUSED`. A menu opens over the screen's own frame.

## What a screen may not do

A screen runs in a sandboxed frame without an origin, under a Content Security Policy that reaches nothing:

- **No network**: it asks its plugin, through its actions, for everything it shows.
- **No styles of its own**: it ships no CSS, and Toppo's stylesheet holds only Toppo's own classes. Lay it out with `Stack` and `Row`, never with `className`.
- **No navigation**: a form calls `event.preventDefault()`; links go through `IssueLink`, `PageLink` or `open`. A frame that loads another document is closed.

A component that throws shows Toppo's own words in its place. The frame's height follows its content.
