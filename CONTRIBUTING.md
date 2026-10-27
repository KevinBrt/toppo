# Contributing to Toppo

Thanks for helping! Toppo aims to stay maintainable by a small team, so contributions follow a few strict rules. They exist to keep the code clean, secure and pleasant to work on.

## Before you start

- For anything beyond a small fix, **open an issue first** to agree on the approach. Features that can live in a plugin usually should.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) (what and why) and [CLAUDE.md](CLAUDE.md) (the coding rules; they apply to humans too).
- Security issues: do not open a public issue, see [SECURITY.md](SECURITY.md). Before touching access, invitations, rate limits, search or uploads, read the security rules of [CLAUDE.md](CLAUDE.md#security-rules-non-negotiable): each one comes from a flaw found and fixed.

## Set up

Requirements: Node.js 24 (`nvm use` reads `.nvmrc`) and Docker.

```sh
npm ci
npm run setup                    # git hooks: format, conventions, commit message
npx playwright install chromium  # browser for component and end-to-end tests
npm run dev                      # database + API on :3000 + web app on :5173
```

## Make a change

1. Branch from `main`.
2. Write tests with the code. Bug fixes start with a failing test that reproduces the bug.
3. Run `npm run check` (lint, conventions, dependencies, types, tests, build). For UI or HTTP changes, also `npm run test:e2e`.
4. Check UI changes at 375 px and on desktop, with the keyboard only.
5. Open a pull request whose title follows [Conventional Commits](https://www.conventionalcommits.org/): `feat(issues): add labels`, `fix(auth): …`, `docs: …`. It becomes the squash commit and the changelog entry.

## What CI checks

| Check                          | Fails when                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Biome, Prettier                | Lint errors or unformatted files                                                                                                                                                                                               |
| `check:conventions`            | Role-name checks, raw SQL, HTML sinks, hard-coded UI text, raw colors, `dark:`, TODO without issue…                                                                                                                            |
| `check:dependencies`           | A package crosses an architecture boundary, a version is not exact, the lockfile pulls from elsewhere than npmjs.org, or another tarball than the package and version an entry names, a shipped license is not AGPL-compatible |
| `npm audit`, dependency review | A known vulnerability is introduced                                                                                                                                                                                            |
| Typecheck                      | Any TypeScript error (strictest settings)                                                                                                                                                                                      |
| Tests                          | A failing test or coverage below thresholds, on PostgreSQL 16 and 18                                                                                                                                                           |
| End-to-end                     | A broken journey, an accessibility violation, a console or CSP error, on desktop and phone, against the Docker image                                                                                                           |
| CodeQL, Scorecard              | Security findings                                                                                                                                                                                                              |

## Releasing

release-please opens the release pull request from the Conventional Commits. Before merging it:

1. With the test server up (`npm run db:up`), run `npm run db:snapshot -- <version>`: it writes `packages/db/snapshots/<version>.json`, the database this version leaves, which the upgrade tests restore and migrate from then on.
2. Keep the snapshots of the last three versions only, and the one named `pre-1.0` until `1.0.0` replaces it: Toppo upgrades directly from these, and through them from older ones.
3. If screens changed, refresh the README's screenshots: `npm run docs:screenshots`.
4. Commit the snapshot (and the screenshots) with the release. A released migration is never edited afterwards.

## Dependencies

Adding a dependency needs a reason in the PR. Prefer the platform and existing packages; a few dozen lines of our own often beat a new package. Versions are exact and install scripts are disabled.

## License of contributions

By contributing, you agree that your contribution is licensed under the [AGPL-3.0](LICENSE) (and MIT for `packages/plugin-sdk`).
