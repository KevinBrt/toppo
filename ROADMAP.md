# Roadmap

What comes next, up to the 1.0 release and right after. The principles and the reasoning live in [ARCHITECTURE.md](ARCHITECTURE.md); this file is the working plan. Tick items as they land, and move what is done out of it.

Each step ends with a working demo, green CI and updated docs. Anything touching the database schema or the plugin contract is reviewed by hand before it is merged.

## Done

Steps 1 to 5 (roles and permissions, projects and issues, views, collaboration, daily work) and most of step 6: the migration tests, the self-hosting documentation, the version and the language on the account, a security review of the source (25 findings fixed, 2026-10-26 and 27), and a scan of the Docker image (2026-10-27: no critical or high vulnerability left once the build tools Better Auth's optional peers dragged in were left out, 293 MB down to 212 MB; the rest is in Debian's base, without a fix yet). What each step decided is in the decisions of [ARCHITECTURE.md](ARCHITECTURE.md#decisions), how in the git history.

## Now

- [ ] Protect `main` once contributors arrive: require the CI checks (quality, tests, end-to-end) before merging.
- [x] Check that the `ghcr.io/kevinbrt/toppo` package is public once the first `edge` image is published (GitHub → Packages → Package settings).

## Step 6: release 1.0

- [ ] Scan the image in CI (Trivy) on every publication and weekly: fail on a critical or high vulnerability that has a fix.
- [x] Merge the release-please pull request: version 1.0.0 and the `latest` image.
- [ ] Announcement on r/selfhosted, once the plugin system and the core features below are in: Toppo goes out as a solid base, not one more tracker.

## After 1.0

- [ ] Plugin system, as designed in [docs/plugins/design.md](docs/plugins/design.md). Built on the integration branch `feat/plugin-system`, one pull request per task, merged into `main` as one change at the end. A security review of its own before it ships: third-party code will run inside Toppo.
  - [ ] **1. Foundations**:
    - [x] the design's decisions in `ARCHITECTURE.md`;
    - [x] internal packages renamed `@toppo-tracker/*` (straight into `main`);
    - [x] the sandbox: QuickJS in WebAssembly, a worker per plugin, capped memory, deadlines, the `ctx` bridge;
    - [x] `@toppo-tracker/plugin-sdk`: `definePlugin`, `defineAction`, `defineEventHandler`, `ctx`;
    - [x] `@toppo-tracker/cli` (`toppo plugin build`) and `@toppo-tracker/plugin-testing`;
    - [x] the `plugins` table, `instance.plugins.manage`, then upload, approval, enabling, uninstalling;
    - [x] each plugin's own user, kept out of every list of people;
    - [x] plugins' permissions in the catalog and the roles matrix;
    - [x] events fanned out from activities, failures that disable a plugin;
    - [x] actions, which a plugin's screens call for a person;
    - [x] **Settings → Plugins**: install, approve in projects, enable, disable, uninstall; a plugin's name, description and logo;
    - [x] a plugin's settings form, generated from the schema it declares;
    - [x] `plugins/time-tracking`, built and installed through the interface in an end-to-end test;
    - [ ] the plugin author's guide, and `CLAUDE.md`'s rules for plugin code.
  - [ ] **2. Data**:
    - [x] what each project sets for itself of a plugin, in its Plugins tab;
    - [x] entities: records on an issue or a project, checked and bounded by Toppo, kept or deleted with their plugin;
    - [ ] indexes: typed slots to filter, sort and sum on a record's own fields;
    - [ ] properties of issues, typed in or computed by a plugin.
  - [ ] **3. Interface**: plugins' screens in sandboxed frames, `@toppo-tracker/plugin-ui`, pages, panels, zones, the project home page.
  - [ ] **4. Beyond the instance**: routes, `ctx.crypto`, outbound HTTP, recurring jobs.
  - [ ] Publish the packages to npm from GitHub Actions, once steps 1 to 3 are done.
- [ ] Webhooks, then the GitHub integration, in the core, on blocks plugins share: the outbound HTTP guard, signed webhooks, routes that check a signature.
- [ ] OIDC, SAML and LDAP, free (Better Auth plugins, added to the endpoint allowlist).
- [ ] Imports from Mantis, Redmine and Jira (CSV first); inbound email.
- [ ] Kanban board, in the core.

## Open questions

None for now.

## Watch list

Known compromises to revisit, not blocking:

- Drizzle ORM 1.0 is still a release candidate: upgrade when it is stable (new migration format).
- The npm override pinning the esbuild of `drizzle-kit`'s loader can go once drizzle-kit drops `@esbuild-kit`.
- The Docker image weighs about 210 MB, largely Better Auth adapters Toppo does not use (MongoDB, Prisma, Kysely): try the `better-auth/minimal` entry point.
- OpenAPI description of `/api/v1`, generated from the Zod schemas (`z.toJSONSchema`), is not published yet.
- Dark theme: possible later by redefining the tokens in `packages/ui/src/theme.css`.
- Statuses on phones: the “Closes the issue” column has no visible header (its boxes are labelled for screen readers only).
- Lost passwords without email: no way back in for now, the only administrator's included (decided 2026-10-25). Proposed for later: a one-time reset link an administrator creates from the members list (like an invitation), and a recovery code printed in the logs on demand for the last administrator.
- Invitations are not rate limited (decided 2026-10-27): a limit per recipient would stop one address from being flooded without slowing a large wave of invitations.
- Markdown: long runs of `*` and `_` still cost the parser more than they should; past a size, a description could be shown as plain text with a button to format it.
- Commands that give access are tested with a custom role by rule only: a check could require it, as `route-permissions.test.ts` does for the routes that send email.
- Vitest's browser mode uses port 63315, which Windows sometimes reserves (Hyper-V): `npm run check` then fails until a restart, unless the port is set in `apps/web/vitest.config.ts`.
