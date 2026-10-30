# Writing plugins

A plugin adds to what Toppo does: a team's own fields and screens, a tool it connects, work done on its own every week. It is TypeScript, written against an MIT-licensed SDK, built into a zip that an administrator installs in **Settings › Plugins**. Toppo runs it apart, where it does only what that administrator approved.

## What a plugin can do

| With                                         | A plugin                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| [Actions](./actions)                         | Answers what its screens, or anyone signed in, ask it, for the person asking |
| [Events](./events-and-jobs#events)           | Hears of what changes on the issues of its projects, and acts on it          |
| [Jobs](./events-and-jobs#jobs)               | Works on its own, every hour, day or week                                    |
| [Routes](./outside-toppo#receiving-requests) | Receives what services outside Toppo send it, once it checked they signed it |
| [Entities](./data#entities)                  | Keeps records of its own, on an issue or a project, that Toppo checks        |
| [Properties](./data#properties)              | Adds fields to issues, written by people or by itself                        |
| [Screens](./screens)                         | Shows pages, panels and dialogs, drawn with Toppo's components               |
| [Outbound requests](./outside-toppo)         | Reaches the sites it declares: a chat, a service                             |

## How Toppo runs it

- **Its server code** runs in a sandbox of its own: a JavaScript engine compiled to WebAssembly, with no file, network, process or timer of the server's. Its only way out is Toppo's calls (`ctx.issues.get`, `ctx.entities…`), each checked like a person's request. Each run has a deadline and a memory; a plugin that goes past them is stopped, without holding Toppo up.
- **Its screens** are React components drawn in a sandboxed frame without an origin, under a strict Content Security Policy: they reach nothing but their own plugin's actions, through Toppo.
- **It acts as itself**, under a user of its own (`<id>@plugins.invalid`), which holds no role and never signs in. What it writes shows as written by it. Acting for a person (an action), it may do only what both it and that person may.

## What an administrator approves

Before a plugin runs, an administrator reads what it declares and approves it:

- **Its needs**: what it reads and writes of Toppo's (`issue.read`, `comment.create`).
- **The permissions it adds**, which roles may then hold, like Toppo's own.
- **The events it hears of**, **the properties it adds**, **its jobs**, **what it reaches outside Toppo**, **where services outside Toppo call it**.
- **Where it acts**: every project, or those chosen; and the hosts inside the network it may reach.

A new version that asks for more waits for a new approval, and stops meanwhile. See [installing and running](./installing).

## The packages

| Package                         | What for                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| `@toppo-tracker/plugin-sdk`     | `definePlugin()`, its actions, events, jobs, entities, properties |
| `@toppo-tracker/plugin-ui`      | The components and hooks of its screens                           |
| `@toppo-tracker/plugin-testing` | A Toppo in memory, to test it                                     |
| `@toppo-tracker/cli`            | `toppo plugin build`, the zip an administrator installs           |
| `@toppo-tracker/create-plugin`  | `npm create @toppo-tracker/plugin`, to start one                  |

All are MIT-licensed, so that a plugin may use any license: its screens draw with Toppo's components, served by Toppo in their frame, so it bundles none of Toppo's code. They share one version; a plugin also names the plugin API it speaks (`apiVersion: '^1.0'`), which Toppo checks as it installs it.

The time-tracking plugin, in Toppo's repository (`plugins/time-tracking`), is built and tested with these packages as any plugin is: the examples of these pages come from it.

Next: [getting started](./getting-started).
