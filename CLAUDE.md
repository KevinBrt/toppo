# Toppo: rules for Claude Code

Toppo is an open-source (AGPL-3.0), self-hosted issue tracker. The code is public and reviewed by strangers: every line must be something we would be proud to show. Read `ARCHITECTURE.md` for the why; this file is the how.

## Commands

| Command                       | What it does                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run setup`               | Once after cloning: enables the git hooks in `.githooks/`                                            |
| `npm run dev`                 | Dev PostgreSQL (Docker) + server on :3000 + Vite on :5173                                            |
| `npm run check`               | **Everything CI runs** except e2e. Must pass before calling a task done                              |
| `npm test`                    | Unit, integration (real PostgreSQL) and browser component tests                                      |
| `npm run test:e2e`            | Builds, then runs Playwright (desktop + phone) against the built server                              |
| `npm run lint` / `lint:fix`   | Biome (code) + Prettier (Markdown, YAML)                                                             |
| `npm run typecheck`           | TypeScript 7 (`tsc`) in every workspace                                                              |
| `npm run check:conventions`   | Project rules the linter cannot express (`scripts/src/conventions`)                                  |
| `npm run check:dependencies`  | Package boundaries, exact versions, lockfile, licenses                                               |
| `npm run db:up` / `db:down`   | Start or stop the dev database and the in-memory test server                                         |
| `npm run perf:issues`         | Query plans of the issue list and search on 100,000 issues (docs/performance.md)                     |
| `npm run db:snapshot`         | At each release adding a migration, `-- <version>`: the database it leaves, for the upgrade tests    |
| `npm run docs:screenshots`    | Rebuilds the README's screenshots (`docs/images/`) from a filled instance                            |
| `npm run docs:dev`            | The documentation site (`docs/`, VitePress), English and French, as you write it                     |
| `npm run plugin-packages:try` | Packs the plugin packages as npm will publish them, then starts, tests and builds a plugin with them |

Run one workspace: `npm test --workspace=@toppo-tracker/core`, or `npx vitest run src/foo.test.ts` inside it. Node 24 (`.nvmrc`) and Docker are required.

## Workflow

1. One roadmap step per session, split into small tasks. **Propose a plan before writing code** and wait for approval when the task touches the schema, the permission model, the plugin SDK or the public API.
2. Write the test first or alongside the code. A task is done only when `npm run check` passes and, for UI or HTTP changes, `npm run test:e2e` too. Run them yourself; never claim a result you did not see.
3. Keep changes focused. No drive-by refactors, no speculative abstractions, no code for a later step.
4. When a decision changes, update `ARCHITECTURE.md` in the same change.
5. If something is ambiguous (product behavior, naming visible to users, a new dependency), ask.

## Architecture rules

```
apps/server  → core, shared, db          apps/web → core, shared, ui
             (+ plugin-sdk: the protocol)           (+ plugin-sdk: the screens' bridge)
packages/core → shared only (pure: no I/O, no framework, no Date.now() without injection)
packages/db   → shared, core             packages/ui → shared
plugins/*     → plugin-sdk, plugin-ui    packages/testing → devDependency only
                (cli, plugin-testing: dev)
packages/plugin-ui → plugin-sdk (MIT: types and relays to the runtime)
packages/plugin-runtime → ui, plugin-sdk, plugin-ui (AGPL: served in screens' frames)
```

Enforced by `check:dependencies` (allowed graph in `scripts/src/dependencies/rules.ts`) and Biome `noUndeclaredDependencies`. Import other workspaces by package name (`@toppo-tracker/core`), never by relative path.

- **Business rules live in `core`** as pure functions, unit-tested without a database. Server commands orchestrate them: authorize → validate → call core → persist (and record the activity) in one transaction.
- **Every issue change writes an `activities` row in the same transaction**, through `recordActivity(tx, …)` (checked), which also queues the job that tells people. History, notifications, webhooks and plugins all read from it. The one exception: a property a plugin writes (`written_by = 'plugin'`), derived data whose history is the plugin's own records. Side effects (email, webhooks) go through the PostgreSQL job queue, never inline in a request.
- **No new service to host.** PostgreSQL is the only infrastructure (search, jobs, sessions). No Redis, no Elasticsearch, no external queue without an `ARCHITECTURE.md` decision.
- **Configuration follows "global default, project override"** for workflows (a project copies the instance’s) and properties (a project adds, hides or adapts them one by one). Reuse these mechanisms; do not invent a per-feature variant. Categories, priorities and labels are single instance-wide lists, never overridden by a project.
- **A complete core, extended by plugins.** What most teams need is in the core (the kanban board, webhooks, GitHub); what is specific to a team or a tool is a plugin. A core integration builds on blocks plugins share (the outbound HTTP guard, signed webhooks, routes that check a signature), never on a shortcut only the core may take.

## Security rules (non-negotiable)

- **Authorization checks a permission, never a role name.** Commands and queries declare `access: { permission: 'instance.users.manage' }`; elsewhere, `can(permissions, permission)` from `@toppo-tracker/core`. `role === 'admin'` is rejected by `check:conventions`. The server is the only judge; the UI hides what the user cannot do, nothing more.
- **Every route declares `config.access`** (`'public'`, `'authenticated'`, `{ permission }`, or `{ project, permission? }` for a project named in its path, which answers 404 to those who do not reach it) and every `/api/` route a Zod response schema: the app refuses to boot otherwise (`platform/http/route-contracts.ts`). Response schemas strip unknown fields, so never return a raw database row "because the schema filters it": select the columns you mean. Only Better Auth's allowlisted endpoints are `delegated`.
- **Authentication stays behind Toppo's guards**: expose a new Better Auth endpoint only by adding it to the allowlist in `platform/auth/auth-routes.ts`, with tests. Never relax the Origin check, the client-IP header or the cookie settings in `platform/auth/auth.ts`.
- **Validate every input with Zod** (body, params, query, headers), on the server, even if the front already did.
- **SQL only through Drizzle or tagged `sql` templates.** `sql.raw()` and `.unsafe()` are banned (an `// allow(no-raw-sql): reason` comment is reviewed like a security change).
- **No HTML injection sinks**: no `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `new Function`, `eval`. User Markdown is rendered with a sanitizer that drops raw HTML.
- **CSP stays strict**: same-origin only, no inline script, no `unsafe-inline`, no `unsafe-eval`, no CDN. Runtime `<style>` tags get the per-request nonce. Fonts and assets are bundled.
- **Secrets never leave the server**: not in logs, errors, responses or the front bundle. 5xx answers are generic (`INTERNAL_ERROR`); details go to the log with the request id. An `HttpError` Toppo answers on purpose with a 5xx keeps its status (a plugin that failed: 502), never its words.
- **Configuration only through `apps/server/src/platform/config/config.ts`**: `process.env` is read nowhere else (Biome `noProcessEnv`). New variables are `TOPPO_*`, validated, defaulted safely and documented in `.env.example`.
- **Randomness for tokens and ids comes from `node:crypto`**, never `Math.random()`.
- **Uploads** (when they come): size limits, content type sniffed server-side, random storage keys, served with `Content-Disposition: attachment` and `nosniff`.
- **Rate-limit authentication and any endpoint that sends email**, through `config.rateLimit` (Toppo's own `rate_limit_counters`, keyed on `request.ip` as Fastify resolves it behind one trusted proxy; never read a forwarding header yourself). `route-permissions.test.ts` lists the routes that send email and finds the commands that do: invitations are the one exception, by decision.
- **A plugin acts within its approval only.** As itself, it is an `Actor` with `plugin` set: `resolveProject` gives it its approved needs in its approved projects, nothing more. Access checked any other way (from roles in SQL, by id) must handle a plugin actor or refuse it, with a test in `plugin-events.test.ts`.
- **Never grant beyond your reach.** An operation that gives access (a role, a project, every project, an invitation, and its renewal or resending) checks that the actor holds or reaches all of it, compares both the current and the resulting effective role, and never applies to the actor themselves. Test it with a custom role holding the permission, not only with an administrator.
- **What reaches beyond the instance belongs to the system role** (`systemOnly` in the catalog): the mail server, outgoing URLs, anything that carries reset or invitation links.
- **Derived data follows the visibility of its source.** Counts, previews, suggestions, search corrections and caches are scoped by project and permission like the rows they come from: a list read by everyone tells what people may not read.
- **Secrets are validated as they are compared** (after normalization), never as typed.
- **Bound what a user can grow**: the length and count of what is stored or derived from their input, the work done per request or per job (one project per transaction, not the instance), and every call outside the process (a total deadline, never a transaction left open waiting on it). Emails someone waits for (password resets, invitations) get a job priority above notifications.
- **A received file is discarded on every failure path**, not only once a response is sent.
- **Markdown**: no new remark or rehype plugin, nor syntax, without checking its cost on hostile input (footnotes are off for that reason).
- New dependency = new attack surface: see "Dependencies".

## Code style

- TypeScript strict to the maximum (`tsconfig.base.json`): no `any`, no non-null `!`, no `@ts-ignore`, no enums or namespaces (Node runs our TypeScript by stripping types). Prefer `unknown` + narrowing, discriminated unions and `as const` objects.
- ESM everywhere; relative imports end with `.ts`/`.tsx`. Named exports only (config files excepted). Files in `kebab-case`.
- **Structure, never pile up** (checked): at most 10 source files per folder, tests aside. When a folder grows, group its files by purpose in subfolders (`components/forms/`, `commands/labels/`), up to two levels inside a kind folder.
- Small functions with intention-revealing names. Comments explain **why**, never what. No commented-out code. `TODO(#123)` must reference an issue.
- Errors: throw `Error` subclasses with a clear message; never swallow an error silently; never `catch` just to log and rethrow. Expected HTTP outcomes throw `HttpError(status, 'STABLE_CODE', message)`; the web app maps codes to translated messages.
- Dates are stored and transmitted in UTC ISO 8601; formatting happens in the browser with `Intl`.
- Identifiers are UUID v7. Every table has `id`, `created_at`, `updated_at`.
- Code, comments, commits, issues and docs are in **English**. User-facing text is translated (English and French).

## Testing rules

| Level       | Where                          | Tool                                      | Covers                                            |
| ----------- | ------------------------------ | ----------------------------------------- | ------------------------------------------------- |
| Unit        | `packages/*/src/*.test.ts`     | Vitest (+ fast-check for parsers)         | Every branch of core logic                        |
| Integration | `apps/server/src/**/*.test.ts` | Vitest + `app.inject()` + real PostgreSQL | Each route: success, 400, 401, 403, 404           |
| Permissions | generated from the catalog     | Vitest                                    | Each route refuses without its permission         |
| Component   | `apps/web`, `packages/ui`      | Vitest browser mode (real Chromium)       | Behavior and accessibility of components          |
| End-to-end  | `e2e/tests`                    | Playwright, desktop + Pixel 7, axe        | Critical journeys, a11y, responsive, headers, CSP |

- Coverage thresholds are enforced (core 90 %, server 85 %). Do not lower a threshold to make CI pass.
- Test behavior through public APIs, not implementation details. Query the UI by role and accessible name, like a user.
- A fixed bug comes with the test that reproduces it; a security fix with a test that fails without it (run it both ways).
- No `.only`, no `.skip` committed (Biome rejects them). No sleeps: wait for a condition.
- Integration tests use the real database: `@toppo-tracker/testing` starts it if needed and `setupTestDatabase()` gives each test file its own. Never mock the database in server tests.
- Web tests render the whole app with `renderApp()` against `fakeServer()` (`apps/web/src/test-helpers.tsx`); add the endpoints a feature calls to the fake server.
- E2E runs a real first-run setup (project `setup`), then reuses the admin session. Sign-in is rate limited (5 per minute): keep sign-ins per run low.
- E2E tests fail on any console error, which includes CSP violations.

## Server structure (`apps/server/src`)

```
main.ts, healthcheck.ts       entry points (server, Docker probe)
app.ts                        wires platform and features together
platform/<area>/              technical, feature-agnostic: http/, auth/, cqrs/, config/, health/
features/<feature>/
  <feature>.routes.ts         the only file at the root: request → command or query → response
  commands/                   <verb>-<resource>.command.ts: defineCommand({ name, access, input, handler })
  queries/                    <verb>-<resource>.query.ts: defineQuery({ name, access, input, handler })
  jobs/                       <verb>-<resource>.job.ts: defineJob({ type, payload, handler })
  models/                     <name>.model.ts: types and Zod schemas of the feature
  utils/                      <name>.util.ts: pure helpers
```

- **Each kind of file has one home** (checked), possibly in grouping subfolders (`commands/labels/add-label.command.ts`): a command outside `commands/`, a model at the root, a `services/` or `repositories/` folder fail CI. Tests sit next to the file they test; route-level tests next to `<feature>.routes.ts`.
- **Light CQRS, no ceremony.** A command changes state and returns at most an id; a query reads and never writes. No bus, no event sourcing, no read database, no repository layer over Drizzle.
- **`defineCommand` / `defineQuery` enforce the envelope** (`platform/cqrs/cqrs.ts`): access is checked first, then the input is validated with its Zod schema (even when the caller is not HTTP: plugins, jobs), then a command's handler runs in **one transaction** (`tx`): everything commits or nothing does. Activities and job enqueues will be written through `tx` too. The one exception is `defineDetachedCommand`, for a command that waits on a plugin's run: no transaction of its own, so that it holds no connection while it waits; it writes only through other commands.
- **Routes are one line**: `command.execute(request.executionContext, request.body)`. No SQL, no business rule, no authorization logic in a route; the route declares the access of the operation it runs, `config: { access: command.access }` (checked).
- **Commands and queries are the API of a feature**, for routes today and plugins tomorrow. Name them `resource.action` (`setup.complete`, `issue.create`), files `commands/<verb>-<resource>.command.ts` and `queries/<verb>-<resource>.query.ts` (checked: a command outside `commands/` fails CI).
- **Layers** (checked): a feature imports `platform/` and its own files only; `platform/` never imports a feature. Logic needed by several features goes to `@toppo-tracker/core` (pure) or becomes a query of its owner, wired in `app.ts`.
- **Capabilities beyond the database** (password hashing, settings) come through `services` in the execution context, declared in `platform/cqrs/cqrs.ts`; never import Better Auth or the config from a feature.
- **Background work is a job** (`platform/jobs/`): a command queues it with `enqueue(tx, job, payload)`, so it exists only if the command commits; any server's worker runs it in a transaction of its own, retried with backoff, kept as `failed` after `maxAttempts`. A job may run twice (a server stopped mid-way): what it does outside the database must bear it. Recurring work is a job with `every`, registered in `createJobs()` (`app.ts`).
- **Email leaves from a job** through `services.mailer` (`platform/mail/`), written with `composeMail()` (plain text and escaped HTML) in the recipient's `users.locale`. A token an email carries is sealed in the job payload with `services.secrets`, never stored in clear.
- **Tests**: a command or query is tested through its route (`app.inject`) and, for edge cases, directly with `execute()` on a `setupTestDatabase()` database.

## Front-end structure (`apps/web/src`)

```
main.tsx, router.tsx          entry point and route tree
routes/
  root.route.tsx
  public/                     screens reachable without a session (login, setup)
  protected/                  screens behind sign-in, in the app frame
    protected.route.tsx       the guard and the frame
    <section>/                one folder per URL section: issues/, projects/, settings/…
      <screen>.route.tsx      route definition, guard, screen component
features/<feature>/                 one folder per kind, nothing at the root but tests
  api/                        <resource>.api.ts: server calls, as an object: Session.signIn()
  queries/                    <feature>.queries.ts: query options and cache keys
  components/                 <name>.tsx
  models/                     <name>.model.ts: types, form schemas, mappings
  utils/                      <name>.util.ts
  constants/                  <name>.constants.ts
shared/<area>/                code used by several features: api/, i18n/, layout/, forms/, security/
```

- **Each kind of file has one home in a feature** (checked): `api/`, `queries/`, `components/`, `models/`, `utils/`, `constants/`, each free to group its files in subfolders (`components/forms/login-form.tsx`); types of a feature are `.model.ts` files in `models/`. `shared/<area>/` stays flat: small focused modules.
- **A screen's folder says whether it needs a session** (checked): every screen is under `routes/public/` or `routes/protected/`, and protected screens hang off `protectedRoute`. Group screens by URL section; do not leave everything at one level.
- **Layers: routes → features → shared** (checked). A feature imports `shared/` and its own files only, never another feature; `shared/` imports nothing above it: pass features in as props or slots (`<AppShell sidebarFooter={<AccountFooter />} />`).
- **API calls are objects named after the resource**: `Session.signIn()`, `Session.completeSetup()`, later `Issues.list()`. One `<resource>.api.ts` per resource, built on `apiRequest()` with a Zod schema for every response.
- **Query options and cache keys** live in `<feature>.queries.ts` as an object (`SessionQueries.currentUser`); keys start with the feature name.
- **File names say what they hold** (checked): components are plain kebab-case `.tsx` (`login-form.tsx`); screens are `.route.tsx`; other files end with their kind: `.api.ts`, `.queries.ts`, `.model.ts`, `.util.ts`, `.types.ts`, `.constants.ts`, `.client.ts`, `.messages.ts`. Same in `packages/ui`.
- **Feature components do not navigate**: they report what happened (`onSignedIn`, `onCompleted`) and the screen decides where to go.

## Front-end rules

- **Light theme only.** No `dark:` variants (checked).
- **Design tokens only**, from `packages/ui/src/theme.css` (the default Tailwind palette is disabled). No hex colors or arbitrary color values in components (checked). Data-driven colors (a status color chosen by an admin) are the only inline colors.
- **No hard-coded user-facing text** (checked): `t('section.key')`. Add the key to `shared/i18n/en.messages.ts` first, then `fr.messages.ts`; the types fail on a missing key or parameter.
- **Responsive by default, mobile first.** Every screen works from 320 px; no horizontal scroll; touch targets ≥ 44 px on coarse pointers (`pointer-coarse:`); respect safe-area insets. Check 375 px and desktop before calling UI done.
- **Accessible by default**: semantic HTML, one `h1` per page, labelled controls, visible focus, full keyboard use, Radix primitives for dialogs/menus/popovers. axe must stay at zero violations.
- Server state with TanStack Query and optimistic updates; routing with TanStack Router; no global state library.
- **Lists are searched, filtered, sorted and paginated by the server.** Never fetch a whole collection to filter it in the browser: the screen sends its filters, search and page (kept in the URL), and the server answers one page plus the counts the screen shows. Only small, bounded configuration lists (roles, statuses) are loaded whole.
- Components are added to `packages/ui` only when reused; keep them dumb (props in, events out, no data fetching, no i18n lookups: labels come in as props).

## Database rules

- Schema in `packages/db/src/schema` (Drizzle). Change it, then `npm run db:generate --workspace=@toppo-tracker/db` writes the SQL migration; data changes go in a custom migration (`drizzle-kit generate --custom`). Show the generated SQL for human review before going further. A released migration is never edited.
- Migrations run at startup, in a transaction, under an advisory lock. `migrations.test.ts` checks them on an empty database; extend it when a migration seeds data.
- Ids are UUID v7 from `uuidv7()` (`@toppo-tracker/db`); every table has `created_at` and `updated_at` (`timestamps` helper).
- Every foreign key indexed; constraints in the database (NOT NULL, CHECK, UNIQUE, FK actions), not only in code.
- Data tied to `@toppo-tracker/core` constants (default roles) must match them: a test compares the seeded rows with the constants.
- Every query on project data is scoped by project and filtered by the user's permissions in the query itself, not after loading.
- A plugin's own user (`users.plugin_slug`) is no person: it holds no role, so lists of people that join the role leave it out. A query that finds people otherwise (by id, by email) excludes it explicitly, with a test in `plugin-users.test.ts`.
- Every list query filters, searches and sorts in SQL and returns one page (at most 100 rows); no endpoint returns an unbounded collection. Search goes through `containsText()` (`@toppo-tracker/db`), which escapes `LIKE` wildcards. Checks that need "all of X" count or select only what they need in SQL.
- Server integration tests call `setupTestDatabase()`: one migrated database per test file, never shared, never mocked.

## Plugins

Official plugins (`plugins/*`) are written as any author would write theirs, and the packages authors use (`plugin-sdk`, `plugin-ui`, `plugin-testing`, `cli`, `create-plugin`, MIT, published at one version) are a public API. The guide for authors is `docs/plugins/`.

- **No privilege**: a plugin imports `@toppo-tracker/plugin-sdk` and `@toppo-tracker/plugin-ui` only (checked), is built by `toppo plugin build`, tested with `@toppo-tracker/plugin-testing`, and installed through **Settings › Plugins** like any other. What it needs that the SDK lacks goes into the SDK, for every author.
- **Ask for the least**: only the needs it uses; `http` naming hosts or settings rather than `'any'`; every setting optional or with a default; tokens and webhook addresses through `secret()`.
- **Every word is a message**, in English and French: name, description, permission, setting and property labels, screens (`useT`), refusals (`ctx.fail`). No text hard-coded in a screen.
- **Screens draw with `plugin-ui` only**: layout with `Stack` and `Row`, never `className` (checked: Toppo's stylesheet holds Toppo's classes, not a plugin's); data through the plugin's own actions; forms call `preventDefault()`.
- **Server code bears being run twice and bounds what it asks**: an event or a job may run again, so comments take `once: event.id` and records are looked for before being created; Toppo's calls are awaited, or sent a few at a time (four are worked on at once, a thousand wait, past that `TOO_MANY_CALLS`).
- **Tested through `createTestToppo`**: every action, event handler and job, its refusals included (`FORBIDDEN`, `NOT_FOUND`, `ctx.fail`), at the coverage threshold of the plugin (90 %).
- **The contract does not break**: within an `apiVersion` major (`API_VERSION`), nothing a plugin uses changes or goes; once a Toppo with plugins has shipped, a capability older Toppos lack raises the minor. A change of the SDK, `plugin-ui` or what Toppo does with a plugin updates `docs/plugins/` (English and French) in the same pull request; examples are imported from `plugins/time-tracking`, never copied.
- **On Toppo's side**, a plugin's call is a feature's command or query (wired in `app.ts`, `platform/plugins/host-calls.ts`), checked as a person's request is: never SQL of its own, never a check that forgets the plugin actor (see the security rules).

## Dependencies

- Prefer the platform and what we already have. A new dependency needs a reason in the PR: maintained, small, MIT/Apache/BSD/ISC-compatible (`check:dependencies` enforces licenses), and not replaceable by ~50 lines of our own.
- Versions are exact (`.npmrc save-exact`), one version per package across the monorepo, lockfile from `registry.npmjs.org` only, each entry bound to the tarball of the package and version it names (no aliases), the repository's own packages always linked, never downloaded. Install scripts are disabled (`ignore-scripts`). A change of `package-lock.json` in a PR is reviewed like code.
- GitHub Actions are pinned by commit SHA; Docker base images by digest.

## Git and pull requests

- Conventional Commits (`feat(issues): …`, `fix(auth): …`); the PR title is the squash commit and feeds the changelog.
- Never commit secrets, `.env`, generated files or `dist/`.
- Do not commit, push or open a PR unless asked.
