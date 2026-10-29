# Installing and running

What an administrator does with a plugin's zip, and how Toppo keeps it running. Managing plugins takes the permission _Manage plugins_, which only the Administrator role holds.

## Installing

In **Settings › Plugins**, **Install a plugin** uploads the zip that `toppo plugin build` made. Toppo checks it before anything of it runs: only the files a plugin's zip holds, 50 MB at most, each file stopped as it unpacks past its limit; then what it declares, read in a sandbox of its own, for a plugin API this Toppo speaks. An instance holds 50 plugins.

A new plugin waits for an approval, and does nothing meanwhile.

## Approving

The plugin's page shows:

- its version and the **package fingerprint** (SHA-256), to compare with the one its author publishes;
- **what it does in Toppo** (its needs), **the permissions it adds**, **the properties it adds**, **what it listens to**, **what it reaches outside Toppo**, **what it does on its own**;
- its **settings**, as a form, secrets kept secret once saved.

Under **Where it acts**, choose **All projects, present and future** or **Chosen projects**, and, for a plugin that reaches outside Toppo, the hosts inside your network it may reach. **Approve and enable** approves the package you reviewed: another one uploaded meanwhile is refused, to be reviewed in turn.

Approving creates the plugin's own user and the properties it adds.

## Upgrading

**Install a new version** uploads its next zip. A version that asks for more than was approved (a need, a permission, an event, a property, a job, more to reach), or whose code refuses the settings already saved, waits for a new approval, and the plugin stops meanwhile. One that asks for no more takes the approved version's place at once.

## Disabling and uninstalling

**Disable** stops it, **Enable** starts it again, as approved. **Uninstall** asks what to do with what it kept (its records, its properties' values): keep it, to be found again if it comes back, or delete it for good. Its own user stays, so that what it wrote keeps its author.

## When it keeps failing

An event or a job that fails counts against the plugin, once, however many times it is tried again; an action never does. At **10 failures in a row**, Toppo disables it and emails those who manage plugins, in its own words, never the plugin's. Its page says why; **Enable again** starts it, its count back at zero. A run that succeeds resets the count too.

## Limits

| What                       | Limit                                                         |
| -------------------------- | ------------------------------------------------------------- |
| An action                  | 5 seconds, 64 KB of input, 300 a minute per person            |
| An event, a job            | 60 seconds each; events ten at a time                         |
| Memory                     | 128 MB per plugin                                             |
| Toppo's calls during a run | 4 at once, 1,000 waiting                                      |
| Requests outside Toppo     | 60 a minute, 10 seconds, 256 KB of answer                     |
| The zip                    | 50 MB; server bundle 10 MB, screens' bundle 5 MB, logo 256 KB |
| Plugins                    | 50 per instance                                               |
