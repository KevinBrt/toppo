<p align="center">
  <img src="docs/images/logo.svg" alt="" width="104">
</p>

<h1 align="center">Toppo</h1>

<p align="center">
  An open-source issue tracker you host yourself.<br>
  One edition with every feature, no user limit, installed with one command.
</p>

<p align="center">
  <img src="docs/images/issues.png" alt="The issue list of a project: twelve open issues with their priority, status, labels and assignee.">
</p>

> **Status: pre-release.** Toppo is finishing its first version, 0.1. Try it now; wait for 0.1 before you trust it with your team's work. Progress is tracked in the [roadmap](ROADMAP.md).

## What Toppo does

- **Issues the way your team works.** Statuses and the moves allowed between them, categories, priorities, labels, and properties of seven types (lists, multi-selects, text, numbers, dates, people, checkboxes). Set once for the instance, adapted per project.
- **Found in seconds.** One search across every project you can see, forgiving typos and reading keys however they are typed (`WEB-42`, `web 42`, `42`). The command palette is one shortcut away, and lists are filtered, sorted and grouped by the server, with the view kept in the address.
- **Several issues at once.** Change the status, priority, category, assignee or labels of a whole selection, or delete it, after a confirmation that says what will happen. Issues that cannot take the change are named, with the reason.
- **Duplicates closed, not forgotten.** Mark an issue as a duplicate of another, in any project: it is closed, both show the link, and its reporter follows the original.
- **Told what matters.** Follow the issues you care about. Notifications arrive in the app and, kind by kind, by email.
- **Your team and your customers in one place.** Roles are made of permissions you choose. Requesters report and follow their own issues without seeing anyone else's.
- **On every screen.** Every page works on a phone, with the keyboard alone, and with a screen reader.

<p align="center">
  <img src="docs/images/issue.png" alt="An issue: its description, comments, properties and the duplicate marked against it." width="49%">
  <img src="docs/images/search.png" alt="The command palette finding the invoice issues despite a typo in the search." width="49%">
</p>

## Why Toppo

Mantis and Redmine still run many teams because they are simple and free, but they show their age. Modern trackers keep single sign-on, permissions or user seats for a paid edition, or exist only as a hosted service. Toppo aims for the middle: a modern, fast interface; everything included, for everyone, forever; and your data on your own server.

## Install

You need a server with Docker and Docker Compose; Toppo runs on amd64 and arm64, a Raspberry Pi included.

```sh
mkdir -m 700 toppo && cd toppo
curl -fsSLO https://raw.githubusercontent.com/KevinBrt/toppo/main/docker/docker-compose.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env && chmod 600 .env
docker compose up -d
docker compose logs toppo | grep "setup code"
```

Open <http://localhost:3000>, enter the setup code from the logs and create the administrator account. [Self-hosting Toppo](docs/self-hosting.md) covers email, HTTPS behind a reverse proxy, backups and restores, and upgrades.

## Built to be trusted

- **One service to run.** Toppo and PostgreSQL, nothing else: no Redis, no search engine, no queue to operate. Background work and search live in PostgreSQL.
- **Secure by default.** Every route checks a permission and validates its input; a strict Content Security Policy; a distroless container running as an unprivileged user on a read-only filesystem. Report vulnerabilities as described in [SECURITY.md](SECURITY.md).
- **Upgrades tested.** Each release is upgraded in CI from the databases earlier versions left behind, before it ships.

## What comes next

After 0.1: a plugin system with an MIT-licensed SDK, and official plugins for webhooks and GitHub; single sign-on (OIDC, SAML, LDAP) at no cost; imports from Mantis, Redmine and Jira. Details in the [roadmap](ROADMAP.md).

## Develop

Requirements: Node.js 24 (see `.nvmrc`) and Docker.

```sh
git clone https://github.com/KevinBrt/toppo.git && cd toppo
npm ci
npm run setup   # enable git hooks
npm run dev     # database + API on :3000 + web app on :5173
```

`npm run check` runs everything CI runs. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and [ARCHITECTURE.md](ARCHITECTURE.md) for how Toppo is built.

## License

Toppo is licensed under the [GNU Affero General Public License v3.0](LICENSE): you can use, modify and host it freely; if you offer a modified version to others over a network, you share its source. The plugin SDK (`@toppo/plugin-sdk`, coming after 0.1) will be MIT-licensed, so plugins can use any license.
