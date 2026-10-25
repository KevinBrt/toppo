# Roadmap

What comes next, step by step, up to the 0.1 release and right after. The principles and the reasoning live in [ARCHITECTURE.md](ARCHITECTURE.md); this file is the working plan. Tick items as they land and keep it current.

Each step ends with a working demo, green CI and updated docs. Anything touching the database schema or the plugin contract is reviewed by hand before it is merged.

## Now

- [ ] Protect `main` once contributors arrive: require the CI checks (quality, tests, end-to-end) before merging.
- [ ] Check that the `ghcr.io/kevinbrt/toppo` package is public once the first `edge` image is published (GitHub → Packages → Package settings).
- [ ] Leave the release-please pull request open until 0.1 is ready: merging it publishes the version and the `latest` image.
- [x] Answer the [open questions](#open-questions) needed by step 2: categories, priorities and labels are instance-wide lists.

## Next up

1. Step 6, the 0.1 release.

## Step 1: roles, permissions and users

_Done when no route answers without a verified permission._

**Authorization**

- [x] `core`: `can(permissions, permission)`, `canAny()`, `permissionsOfRole()`: a role never grants a permission it may not be given, nor one the catalog no longer knows.
- [x] `defineCommand` / `defineQuery`: `access: { permission }` (organisation permissions), checked before the input; the actor's permissions are loaded with the user on every request.
- [x] Routes declare the access of the operation they run, `config: { access: operation.access }` (checked by `check:conventions`).
- [x] `/api/v1/me` returns the organisation permissions; the web app hides the settings from users who cannot manage anything (the server stays the only judge).
- [x] Permission tests generated from the registered routes: every route refuses a user who has every permission but its own and accepts one who has only its own; open API routes are listed explicitly.

**Roles model**

- [x] One list of roles for the instance and projects (migrations 0004 to 0007): a locked system role (Administrator) with every permission, badge colors from the palette.
- [x] A role is just a role: no internal or client kind (migration 0010). A role can be deleted once nobody holds it; history keeps no reference to it (migration 0011).

**Members** (`features/users`)

- [x] List members, change their role, deactivate and reactivate them (sessions revoked at once, sign-in refused while deactivated).
- [x] Never leave the instance without an active member holding the system role, even when two administrators act at once; only holders of the system role give it, take it away, or act on its holders; nobody changes their own role.
- [x] The members list is searched, filtered and paginated by the server, with its filters in the URL.
- [x] Delete a member, after confirming: their personal data is erased, history keeps an anonymous author, the address is free again.
- [x] Settings layout after the mockups: settings navigation and breadcrumb; members table with role tabs and counts, search, colored role badges, state and a row menu. The mockup’s selection checkboxes (bulk actions) and the Projects and Activity columns come with their features.
- [x] Invitations without SMTP: "Invite members" (emails and a role) gives links to copy (single use, expire after 7 days, only a hash of the token stored, the token after `#` so it stays out of logs); pending invitations show among the members as "Invited" or "Expired", with a new link (the old one dies) and revoke; a public page to accept (name, password). Email delivery comes with step 4.

**Roles and permissions** (`features/roles`)

- [x] Matrix after the mockups: roles in columns, permissions by section in rows, switches; the system role locked; "See issues" as none, own or all; unsaved changes bar, saved in one transaction; one role at a time on phones.
- [x] Create a role (name, color), rename it, delete it while nobody holds it (members, pending invitations); at most 20 roles. The system role cannot be changed.

**Account**

- [x] Account page, from the account in the sidebar: change one's name; change one's password (the current one first), which signs out every other device.

**Tests**

- [x] End-to-end: the administrator invites a team member, who accepts, signs in and cannot open the settings.
- [x] End-to-end, a member’s whole journey: a role made in the matrix, an invitation with it, access to the members but not the roles, the permission taken back and gone on the next request, one’s own account, then the member and the role deleted.

## Step 2: projects and issues

_Done when an issue can be created and closed._

Nine tasks. The first issue can be created and closed at task 6, with the seeded defaults; the settings screens come after. Reference mockups: the project's issue list and the issue page.

1. **Schema and defaults** (reviewed by hand before the migration)
   - [x] `projects` (`next_issue_number`: the counter, locked by the creating transaction), `project_members`, `statuses`, `workflows`, `workflow_statuses`, `priorities` (four fixed levels), `issue_categories`, `issues` (`UNIQUE (project_id, number)`), `activities` (outliving a deleted issue); project access on users and invitations.
   - [x] Defaults, renamed in the administrator’s language at setup: the workflow New, To do, In progress, Waiting, Resolved; the priorities Low, Normal, High, Urgent; the categories Bug, Request, Question.
   - [x] `workflow_transitions` (migrations 0014 and 0015): which status may follow which, by default New → To do, In progress, Resolved; To do → In progress, Resolved; In progress → To do, Waiting, Resolved; Waiting → In progress, Resolved; Resolved → To do.
2. **Domain rules in `core`**
   - [x] Effective workflow (the project's or the instance's) and initial status; an issue is closed while its status closes issues, `closed_at` follows.
   - [x] Transitions (`nextStatusesOf`, `canMoveTo`): people change an issue’s status, never the system, and only to a status the workflow allows from the current one, administrators included.
   - [x] Effective permissions in a project: the role the project gives the member, or else their own role; the system role has everything.
   - [x] Issue validation rules shared by the server and the forms.
3. **Project permissions**
   - [x] `access: { project: 'projectKey' | 'issueKey', permission? }`, the project named in the route's path; permissions in the project read by one query; a project a member cannot reach answers 404, as if it did not exist; an archived project is read-only. First route: `GET /api/v1/projects/:projectKey`.
   - [x] Generated permission tests cover project routes: no access, access without the permission, a role given by the project.
4. **Projects and access**
   - [x] Create (`project.create`; the creator gets access), list (paged and searched by the server), settings (name, description, key until the first issue), archive and unarchive: an archived project is read-only.
   - [x] Access per member: none until given, every project, or chosen ones; chosen when inviting (none by default), changed from the member or the project; a role per project; the system role reaches every project.
   - [x] Whoever manages a project's members cannot give a role stronger than their own; a role given in a project cannot be deleted.
   - [x] The projects screen manages projects (after the mockups): those one manages, each opening on its general settings (name, key, color, description, archive, delete for good with `project.delete`) and its access (automatic access, members, invitations). Projects are set up by administrators by default.
5. **Issues, server side**
   - [x] Create (number from the counter, initial status, default category and priority), read by key (`WEB-42`), change title, description, category and priority, change the status to one the workflow allows from the current one (closing and reopening included), assign to anyone who reaches the project.
   - [x] Delete for good after confirming: an activity keeps the key and who deleted it; the number is never reused.
   - [x] One page of a project's issues, newest first (sorting and filters come with step 3).
   - [x] Every issue change writes an `activities` row in the same transaction; an issue's history is read page by page, and the forms get the project's statuses, categories, priorities and assignable people.
6. **Issues, in the app** (after the mockups)
   - [x] A project's issues on the Issues screen (chosen by project), the open issues and last activity columns of the projects screen, the creation form, the issue page at `/issues/WEB-42`: Markdown description (`react-markdown`, raw HTML ignored), fields edited in place with optimistic updates, the status menu offering only the allowed next statuses, activity history, delete after confirming. From 320 px, with the keyboard.
   - [x] My issues: those assigned to oneself, open or closed, in every project one may still read them, the most urgent first; archived projects left out. An issue's activity reads newest first.
7. **Categories and priorities in the settings** (`instance.settings.manage`)
   - [x] Settings › Issues › Issue properties (after the mockups): Priority and Category as the two global lists of options, each edited in a side panel and saved whole, in one transaction.
   - [x] Categories: add, rename, recolor, reorder (drag and drop, with the keyboard and announced to screen readers), choose the default, delete once unused; a category added meanwhile by someone else is never deleted.
   - [x] Priorities: rename the four levels, choose the default; names unique whatever the case (migration 0018).
8. **Workflows**
   - [x] Global workflow editor (Settings › Issues › Statuses, after the mockups): statuses, whether they close issues (migrations 0020 to 0022), color, order, initial status, which status may follow which or free moves (migration 0019), saved whole; a status taken out moves its issues where chosen, one activity each.
   - [x] "Customize for this project" (a copy of its own, transitions and mode included, the instance’s statuses shared and edited in the settings only); "revert to the global workflow" with the status mapping step, in one transaction, one activity per moved issue.
9. **End-to-end and docs**
   - [x] Create a project, report its first issue, move it through the workflow, close it, on desktop and phone (`e2e/tests/issues.spec.ts`).
   - [x] `ARCHITECTURE.md` and this roadmap reviewed once tasks 7 and 8 are done.

## Step 3: views

_Done when an issue is found in under 3 seconds._

- [x] Issue list: open issues first, sort, group (status, priority, assignee), pagination, state kept in the URL.
- [x] Filters as a row of menus (state, status, priority, category, assignee, requester); sorting from the column headers; saved in the URL.
- [x] Full-text search (`tsvector`) and fuzzy search (`pg_trgm`); `WEB-42` finds the issue.
- [x] Search palette (`Ctrl/Cmd + K`, or the Search button), where typing `WEB-42` opens the issue; the one keyboard shortcut.
- [x] Phone layout of the list (cards instead of a table).
- [x] Indexes checked with `EXPLAIN` on a seeded database of realistic size: 100,000 issues, `npm run perf:issues` ([docs/performance.md](docs/performance.md)).

## Step 4: collaboration

- [x] Comments in plain text, shown as written with their line breaks; edit and delete one's own; moderation permission.
- [x] Attachments on an issue's request and on comments (migration 0027): images, PDF, text, CSV, Office and OpenDocument files, the type an extension names confirmed by the content; 20 MB each by default (`TOPPO_ATTACHMENT_MAX_SIZE_MB`), 20 per request or comment, uploads stopped below 1 GB free; stored under `/data/uploads` with random keys, swept once no row names them; downloads authorized and served as attachments, images and PDFs also inline. In the app (after the mockups): a drop zone in the new issue form, the request's files under its words, files in the comment box and with each comment, each removed after asking; images and text shown in a viewer, PDFs opened in the browser's viewer in a new tab, other files downloaded.
- [x] Labels (migration 0028): one list for the instance, edited in the settings beside Priority and Category; no project labels; at most 100. Several per issue, given with `issue.update` in a menu that saves once closed; shown in the lists, which filter by them; a label deleted leaves its issues, told in their history.
- [x] Properties (Version, Team…), replacing custom fields: defined for the instance; a project adds its own, hides one or replaces its options; each shown in the issue list or not, asked at creation or not, then required or not. List type first, then multi-select, text, number, date, user, checkbox. Priority and Category join the same page as global properties: a project may hide them or require them at creation, their options staying one list for the instance (after the mockups).
  - [x] Lists of options defined for the instance (migration 0036): created, edited and deleted in Settings › Issue properties; shown in the lists as a chip beside the subject, asked at creation, required; changed beside the issue, told in its history.
  - [x] Project adaptation (migration 0037): in the project's settings, Priority and Category hidden or required at creation; each of the instance's properties hidden or given options of its own; properties of the project's own.
  - [x] Multi-select, text, number, date, user and checkbox properties (migration 0038): the type chosen once in the settings, each type its own field beside the issue and in the new issue form, its chip in the lists and its line in the history; naming someone needs `issue.assign`.
  - [x] Filtering the list by property: options, people and boxes from a « + Property » menu, which opens the filter chosen, dates and numbers by range in a dialog; kept in the address (`property=<id>:<values>;<id>:<from>..<to>`), checked against the project's properties by the server, through the index of the values (`npm run perf:issues`: 20 to 47 ms on 100,000 issues).
- [x] Background job queue in PostgreSQL (migration 0029, `FOR UPDATE SKIP LOCKED`): a worker in every server process, jobs queued through a command's transaction, retried with backoff, kept as failed after their last try, recurring jobs queued once; the attachment sweep runs on it.
- [x] In-app notifications (migration 0030), fed by `activities` through a job: the assignee, the reporter, the commenters and the people named told of what concerns them, never who acted, only while they see the issue. A bell in the top bar with the unread count, the latest in a menu, every notification on a page; marked read one by one or all at once; read ones pruned after 90 days. Mentions with `@` in comments and their edits, among the people who see the issue.
- [x] Email (migrations 0031 and 0032): SMTP settings in the admin (password sealed with the instance key, never sent back), a test email that says why the server refused it, invitations emailed, password reset by email (token stored as a hash, every device signed out), notifications emailed 5 minutes later unless read in Toppo, each kind turned off in one's account (migration 0035); every email in the language of whoever receives it.
- [x] New issues told to the roles that ask for it (migrations 0033 and 0034): a setting of each role in the matrix, Administrator and Team on, Requester off, the system role free to turn it off; the issue's assignee told at creation.

## Step 5: daily work

_Done when a team works its issues as it did in Mantis: found despite a typo, followed, changed several at once, duplicates closed._

- [x] Search that forgives typos and finds issues sooner (migrations 0039 and 0040, `npm run perf:issues`: 40 to 51 ms with a typo on 100,000 issues, 44 ms for a member's two words instead of 149): in the palette and the list, a word no issue has is matched to the closest words issues have (one typo in 4 or 5 letters, two beyond), in titles and descriptions; references written loosely (`WEB42`, `WEB 42`, a number alone in every project); the palette checks access once per project rather than per match.
- [x] Following an issue (migration 0041): the reporter, the assignee and those who comment follow it until they stop; anyone who sees it may follow it, from a button on its page. Followers are told of comments, status changes and assignments (a new email kind), the assignee it leaves too.
- [x] Actions on several issues of the list: a box per row and one for the page, a bar at the bottom of the screen; status, priority, category, assignee, labels added or removed, deletion, each confirmed before it applies. Each issue takes the change if it may, with its activity and notifications; those that may not are named, with why, and stay ticked.
- [x] Duplicates (migration 0042): an issue marked as a duplicate of another one the person sees, any project, found by its key or words, and moved at once to a closing status its workflow allows; each shows the other, the mark can be taken off, and the duplicate's reporter follows the original. Those following the duplicate are told (a new email kind).

## Step 6: release 0.1

- [ ] Import from Mantis and Redmine (CSV first).
- [ ] Migration tests: upgrade a database created by the previous version.
- [ ] Documentation: installation, upgrade, backup and restore, reverse proxy; screenshots.
- [ ] Security review: threat model, CSP and headers, dependency audit, container scan.
- [ ] Merge the release-please pull request: version 0.1.0 and the `latest` image.
- [ ] Announcement on r/selfhosted.

## After 0.1

- [ ] Plugin system: `@toppo/plugin-sdk` (MIT), manifest and `apiVersion`, loader, hooks fed by `activities` through the job queue, plugin HTTP routes, settings forms generated from Zod, declarative UI contributions.
- [ ] Official plugins: webhooks, then GitHub.
- [ ] OIDC, SAML and LDAP, free (Better Auth plugins, added to the endpoint allowlist).
- [ ] Jira import; inbound email.
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
