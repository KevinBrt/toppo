# Getting started

You need Node.js 24 and a Toppo to install the plugin on, where you hold the Administrator role.

## Start a plugin

```sh
npm create @toppo-tracker/plugin issue-digest
cd issue-digest
npm install
```

The folder's name is the plugin's **id**: 3 to 40 lowercase letters, digits and dashes, starting with a letter. It names the plugin everywhere, its permissions included, and never changes. `create-plugin` writes:

```
issue-digest/
├── package.json        # its version, and its build and test scripts
├── tsconfig.json
└── src/
    ├── plugin.ts       # definePlugin(): what it is and what it declares
    └── actions/
        ├── greet.action.ts
        └── greet.action.test.ts
```

Every `.ts` file of `src/` is part of the plugin, `src/plugin.ts` first: there is nothing to register. A test file (`*.test.ts`) is left out of the build.

## Its first action

`src/plugin.ts` declares the plugin; its name and description are keys of its messages, in English and French, so that an administrator reads them in their language:

```ts
import { definePlugin } from '@toppo-tracker/plugin-sdk';

export const plugin = definePlugin({
  id: 'issue-digest',
  name: 'plugin.name',
  description: 'plugin.description',
  apiVersion: '^1.0',
  messages: {
    en: {
      plugin: { name: 'Issue digest', description: 'What Issue digest does, in a sentence.' },
      greeting: 'Hello, {name}!',
    },
    fr: {
      plugin: { name: 'Issue digest', description: 'Ce que fait Issue digest, en une phrase.' },
      greeting: 'Bonjour, {name} !',
    },
  },
});
```

`src/actions/greet.action.ts` defines an action anyone signed in may run, which answers in their language:

```ts
import { z } from '@toppo-tracker/plugin-sdk';
import { plugin } from '../plugin.ts';

export const greet = plugin.defineAction({
  name: 'greeting.say',
  access: 'authenticated',
  input: z.object({ name: z.string().trim().min(1).max(100) }),
  handler: (ctx, { name }) => Promise.resolve({ text: ctx.t('greeting', { name }) }),
});
```

## Test it

```sh
npm test
```

The test runs the action against a Toppo in memory, as a person would, without an instance:

```ts
const toppo = createTestToppo(plugin, { locale: 'fr' });
const someone = toppo.createUser();

expect(await someone.run(greet, { name: ' Ada ' })).toStrictEqual({ text: 'Bonjour, Ada !' });
```

See [testing](./testing).

## Build it

```sh
npm run typecheck
npm run build
```

`toppo plugin build` bundles the plugin into `dist/issue-digest-0.1.0.zip`, the version taken from `package.json`, then reads what it declares as Toppo will, and prints it. It refuses what Toppo would refuse, with the reason: an import of Node's modules, a manifest Toppo would not take, a bundle too heavy.

## Install it

In Toppo, open **Settings › Plugins**, click **Install a plugin** and choose the zip. The plugin waits for an approval: read what it declares, choose the projects it acts in, then **Approve and enable**. See [installing and running](./installing).

Next: [the manifest](./manifest), all a plugin may declare.
