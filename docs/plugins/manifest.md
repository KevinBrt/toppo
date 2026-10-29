# The manifest

`definePlugin()` declares what the plugin is and what it asks for. Toppo never reads a manifest file: it runs the plugin's bundle in its sandbox and reads what `definePlugin()` declared, strictly, refusing anything it does not know. The time-tracking plugin declares:

```ts
export const plugin = definePlugin({
  id: 'time-tracking',
  name: 'plugin.name',
  description: 'plugin.description',
  logo: 'logo.png',
  apiVersion: '^1.0',
  needs: ['issue.read'],
  permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
  settings: z.object({
    hoursPerDay: z.number().min(1).max(24).default(8),
    summaryUrl: secret(z.url()).optional(),
    summaryLanguage: z.enum(['en', 'fr']).default('en'),
  }),
  http: { fromSettings: ['summaryUrl'] },
  projectSettings: z.object({
    budgetDays: z.number().positive().max(100_000).optional(),
  }),
  entities: { timeEntry },
  properties: { timeSpent },
  messages: { en: { … }, fr: { … } },
});
```

## Identity

| Field                 | What it is                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | 3 to 40 lowercase letters, digits and dashes, starting with a letter. It names the plugin for good. `toppo` and Toppo's own resources (`issue`, `project`…) are taken. |
| `name`, `description` | Keys of its messages: an administrator reads them in their language.                                                                                                   |
| `logo`                | Optional: `logo.png` or `logo.webp`, beside `package.json`, 256 KB at most. Checked by its bytes; SVG, which may carry script, is refused.                             |
| `apiVersion`          | The plugin API it speaks, `^1.0`: Toppo installs it if it speaks the same major version and at least that minor one.                                                   |

Its version is `package.json`'s.

## Messages

Every word a plugin shows is one of its messages, in English and French: `messages: { en, fr }`, nested objects of strings, 1,000 characters each at most. A French message missing from `fr` fails type checking. `{name}` in a message is filled by `ctx.t('greeting', { name })`. Screens read them with `useT`.

## Needs

What the plugin reads and writes of Toppo's, as itself, in the projects it is approved in. They are its ceiling: acting for a person, it holds what both it and the person hold.

| Need             | Lets it                                                |
| ---------------- | ------------------------------------------------------ |
| `issue.read`     | Read the issues of its projects: `ctx.issues.get`      |
| `comment.create` | Comment on them, as its own user: `ctx.issues.comment` |

An action on an issue, an issue panel, an entity on issues and a property all take `issue.read`: the build refuses them without it.

## Permissions

`permissions` adds permissions to Toppo's catalog, named after the plugin (`time-tracking.entries.log`), which roles hold like Toppo's own. Each has a `scope`, `'project'` (held in each project a person reaches) or `'instance'`, and a `label` among its messages; 30 at most. Only the Administrator role holds them at first: an administrator gives them to other roles in **Settings › Roles and permissions**. An action, a page or a panel asks for one in its `access`.

## Settings

`settings` and `projectSettings` are flat Zod objects, which Toppo draws as forms: the instance's on the plugin's page, a project's in its **Plugins** tab, with _Project settings_.

- A field is text (`z.string()`, `z.url()` and `z.email()` drawn as such), a number with its bounds, a yes or no (`z.boolean()`), or a choice (`z.enum()`, 50 values at most); 30 fields at most.
- Each is `.optional()` or has a `.default()`: a plugin runs before anyone sets it.
- Each is labelled by `settings.<name>.label` in its messages (`projectSettings.<name>.label` for a project's), with an optional `.help`, and `.options.<value>` for a choice.
- `secret(z.string())`, `secret(z.url())`: a text of the instance's, without a default, sealed with the instance's key once saved and never shown again. Only the plugin's sandbox opens it.

The plugin's own schema checks what is saved, in its sandbox, field by field. It reads them as `ctx.settings`, and a project's as `await ctx.projects.settings(projectId)`, parsed, its defaults applied.

## The rest

| Field                    | See                                       |
| ------------------------ | ----------------------------------------- |
| `entities`, `properties` | [Records and properties](./data)          |
| `http`                   | [Reaching outside Toppo](./outside-toppo) |

Actions, event handlers, jobs and screens are declared by the plugin's own calls (`plugin.defineAction`…), each in its own file: see the next pages.

## Asking for more

A new version that asks for more than was approved waits for a new approval, and stops meanwhile: a new need, permission or wider scope, event, property or job, more to reach outside Toppo; or code that refuses the settings already saved. One that asks for no more replaces the approved version at once. Permissions a version no longer declares leave every role.
