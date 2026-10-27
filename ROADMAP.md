# Roadmap

What comes next, up to the 1.0 release and right after. The principles and the reasoning live in [ARCHITECTURE.md](ARCHITECTURE.md); this file is the working plan. Tick items as they land, and move what is done out of it.

Each step ends with a working demo, green CI and updated docs. Anything touching the database schema or the plugin contract is reviewed by hand before it is merged.

## Done

Steps 1 to 5 (roles and permissions, projects and issues, views, collaboration, daily work) and most of step 6: the migration tests, the self-hosting documentation, the version and the language on the account, and a security review of the source (25 findings fixed, 2026-10-26 and 27). What each step decided is in the decisions of [ARCHITECTURE.md](ARCHITECTURE.md#decisions), how in the git history.

## Now

- [ ] Protect `main` once contributors arrive: require the CI checks (quality, tests, end-to-end) before merging.
- [ ] Check that the `ghcr.io/kevinbrt/toppo` package is public once the first `edge` image is published (GitHub → Packages → Package settings).

## Step 6: release 1.0

- [ ] Scan the Docker image for known vulnerabilities, and fix or document what it finds.
- [ ] Merge the release-please pull request, left open until then: version 1.0.0 and the `latest` image.
- [ ] Announcement on r/selfhosted.

## After 1.0

- [ ] Plugin system: `@toppo/plugin-sdk` (MIT), manifest and `apiVersion`, loader, hooks fed by `activities` through the job queue, plugin HTTP routes, settings forms generated from Zod, declarative UI contributions. A security review of its own before it ships: third-party code will run inside Toppo.
- [ ] Official plugins: webhooks, then GitHub.
- [ ] OIDC, SAML and LDAP, free (Better Auth plugins, added to the endpoint allowlist).
- [ ] Imports from Mantis, Redmine and Jira (CSV first); inbound email.
- [ ] Kanban board, as a plugin or in core (to decide).

## Open questions

None for now.

## Watch list

Known compromises to revisit, not blocking:

- Drizzle ORM 1.0 is still a release candidate: upgrade when it is stable (new migration format).
- The npm override pinning the esbuild of `drizzle-kit`'s loader can go once drizzle-kit drops `@esbuild-kit`.
- The Docker image weighs about 280 MB, largely Better Auth adapters Toppo does not use (MongoDB, Prisma, Kysely): try the `better-auth/minimal` entry point.
- OpenAPI description of `/api/v1`, generated from the Zod schemas (`z.toJSONSchema`), is not published yet.
- Dark theme: possible later by redefining the tokens in `packages/ui/src/theme.css`.
- Statuses on phones: the “Closes the issue” column has no visible header (its boxes are labelled for screen readers only).
- Lost passwords without email: no way back in for now, the only administrator's included (decided 2026-10-25). Proposed for later: a one-time reset link an administrator creates from the members list (like an invitation), and a recovery code printed in the logs on demand for the last administrator.
- Invitations are not rate limited (decided 2026-10-27): a limit per recipient would stop one address from being flooded without slowing a large wave of invitations.
- Markdown: long runs of `*` and `_` still cost the parser more than they should; past a size, a description could be shown as plain text with a button to format it.
- Commands that give access are tested with a custom role by rule only: a check could require it, as `route-permissions.test.ts` does for the routes that send email.
- Vitest's browser mode uses port 63315, which Windows sometimes reserves (Hyper-V): `npm run check` then fails until a restart, unless the port is set in `apps/web/vitest.config.ts`.
