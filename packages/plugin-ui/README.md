# @toppo-tracker/plugin-ui

What a [Toppo](https://toppo-tracker.app) plugin's screens are drawn with: Toppo's components (`Page`, `Table`, `Field`, `Button`…) and hooks (`useActionQuery`, `useActionMutation`, `useScreen`, `useT`). A screen is a React component in a `.tsx` file of the plugin; Toppo draws it in a sandboxed frame, with its own React and components.

This package holds types and relays only: the components come from the runtime Toppo serves, so a plugin bundles none of Toppo's code. It works inside Toppo's frame, and nowhere else.

The guide: https://toppo-tracker.app/plugins/

MIT licensed.
