# @toppo-tracker/plugin-testing

A [Toppo](https://toppo-tracker.app) in memory, to test a plugin without an instance: the same rules as Toppo's, from access and needs to entities' limits.

```ts
import { createTestToppo } from "@toppo-tracker/plugin-testing";

const toppo = createTestToppo(plugin, { locale: "fr" });
const issue = toppo.createIssue();
const someone = toppo.createUser({ permissions: ["entries.log"] });
await someone.run(logTime, { issueId: issue.id, minutes: 30, spentOn: "2026-10-29" });
```

The guide: https://toppo-tracker.app/plugins/

MIT licensed.
