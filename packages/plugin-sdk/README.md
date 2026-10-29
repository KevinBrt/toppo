# @toppo-tracker/plugin-sdk

What a [Toppo](https://toppo-tracker.app) plugin is written with: `definePlugin()`, its actions, event handlers, jobs, entities, properties and screens, and the context they run with. Toppo runs a plugin in a sandbox of its own, where it does only what an administrator approved.

```ts
import { definePlugin, z } from '@toppo-tracker/plugin-sdk';

export const plugin = definePlugin({
  id: 'issue-digest',
  name: 'plugin.name',
  description: 'plugin.description',
  apiVersion: '^1.0',
  messages: { en: { plugin: { name: 'Issue digest', description: '…' } }, fr: {/* … */} },
});
```

Start a plugin with `npm create @toppo-tracker/plugin my-plugin`. The guide: https://toppo-tracker.app/plugins/

MIT licensed, so that a plugin may use any license.
