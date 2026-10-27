# Self-hosting Toppo

Toppo ships as one Docker image (`ghcr.io/kevinbrt/toppo`, amd64 and arm64) that needs PostgreSQL 16 or newer. The provided compose file runs both.

## What you need

- A 64-bit Linux server, NAS or Raspberry Pi with Docker Engine and Docker Compose v2 (`docker compose version`).
- About 1 GB of memory for a small team, and disk space for the database and the attached files.
- To reach Toppo from outside your network: a domain name and a reverse proxy that terminates HTTPS ([below](#behind-a-reverse-proxy-https)).

## Install

```sh
mkdir -m 700 toppo && cd toppo
curl -fsSLO https://raw.githubusercontent.com/KevinBrt/toppo/main/docker/docker-compose.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env && chmod 600 .env
docker compose up -d
```

`docker compose ps` shows both services as `healthy` once ready. Toppo answers on port 3000. The folder and `.env` are yours alone: `.env` holds the database password, and later the settings you add.

Before going further, add to `.env` the address people will open, and the version to run (see the [releases](https://github.com/KevinBrt/toppo/releases)):

```sh
TOPPO_URL=https://toppo.example.com
IMAGE_TAG=0.1.0
```

`TOPPO_URL` is used in every link Toppo sends: invitations, password resets, notifications. `IMAGE_TAG` defaults to `latest`, which follows releases: pin a version in production and upgrade on purpose. Apply a change of `.env` with `docker compose up -d`.

## First run

1. Read the setup code in the logs:

   ```sh
   docker compose logs toppo | grep "setup code"
   ```

   The line looks like `Toppo is not set up yet: open http://localhost:3000 and enter the setup code ABCD-EFGH-JKLM`. A new code is printed at each start until setup is done.

2. Open Toppo, enter the code and create the first administrator account.
3. Set up email in **Settings › Email** (below).
4. Invite your team from **Settings › Members**: each person gets a personal link, valid for 7 days, sent by email when it is set up, or that you send them yourself. They choose their name and password when they open it.
5. Adjust what each role allows in **Settings › Roles and permissions**. Administrator, Team and Requester are only a starting point: rename them, change them or create your own.

The code exists so that nobody else can claim a fresh instance reachable from the network. Once the first administrator exists, the wizard is closed for good. For automated deployments, preset the code with `TOPPO_SETUP_CODE`.

## Email

Toppo sends invitations, password resets and notifications through your mail server: enter its host, port, security (STARTTLS, TLS, or none for a relay on your own network), account and sender address in **Settings › Email**, then send yourself a test message from the same page. The password is stored encrypted with the instance's secret key.

Without email, Toppo works, but invitation links must be passed on by hand, notifications stay in the bell, and **a forgotten password cannot be reset**: set email up before someone needs it.

## Configuration

Settings are environment variables, set in `.env` next to `docker-compose.yml`. The full list, with defaults, is in [`.env.example`](../.env.example).

- `TOPPO_*` variables are read by Toppo. An unknown `TOPPO_*` variable stops the server with an explicit message, so a typo never goes unnoticed.
- Any `TOPPO_*` variable can be read from a file instead: `TOPPO_DATABASE_URL_FILE=/run/secrets/database_url` (Docker or Kubernetes secrets).
- `IMAGE_TAG` and `HTTP_PORT` only change `docker-compose.yml` (image version and published port).

## Behind a reverse proxy (HTTPS)

1. Set `TOPPO_URL=https://toppo.example.com`. Toppo then sends HSTS and upgrades insecure requests.
2. Publish Toppo's port on the server itself only, so that the proxy is the only way in: `HTTP_PORT=127.0.0.1:3000`.
3. Then set `TOPPO_TRUST_PROXY=true`, so that Toppo reads the client's address from the proxy's headers (sign-in rate limits rely on it). Never set it while Toppo's port is reachable directly: anyone could then claim any address. Toppo trusts the one proxy that connects to it: the client is the last address of `X-Forwarded-For`, the one that proxy added, whatever the client wrote before it. With a second proxy or a CDN in front, have the one next to Toppo replace the header with the address it trusts rather than append to it.
4. Point the proxy at port 3000. Health checks: `GET /health` returns 200 when Toppo and its database are up, 503 otherwise.

The proxy must let attachments through: up to 20 MB by default (`TOPPO_ATTACHMENT_MAX_SIZE_MB`).

With Caddy, which gets the certificate itself and sets no size limit:

```
toppo.example.com {
  reverse_proxy localhost:3000
}
```

With nginx, which refuses request bodies over 1 MB unless told otherwise:

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name toppo.example.com;
  ssl_certificate     /etc/letsencrypt/live/toppo.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/toppo.example.com/privkey.pem;

  client_max_body_size 25m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Attachments

People attach files to issues and to comments: images (PNG, JPEG, WebP), PDF, text and logs, CSV, Word, Excel and PowerPoint files, and their OpenDocument counterparts.

- **Size**: 20 MB per file by default; `TOPPO_ATTACHMENT_MAX_SIZE_MB` changes it (1 to 1024). At most 20 files on an issue's request, and on each comment.
- **Checks**: the type a file's extension names must match its content, read by the server; anything else is refused (SVG, HTML, archives, executables…). Images and text files are shown in the app, PDFs open in the browser's own viewer, every other file is downloaded; the browser never runs anything of a file.
- **Storage**: files are kept in the `/data` volume, under `uploads/`, named by random keys. Toppo stops accepting files while less than 1 GB is free there. Files removed, or left by deleted issues and projects, leave the disk within the hour.

## Using an existing PostgreSQL

Remove the `db` service from `docker-compose.yml` and set `TOPPO_DATABASE_URL`, for example `postgres://toppo:password@db.example.com:5432/toppo?sslmode=require`. The user needs to own the database: Toppo creates and migrates its tables at startup, and installs `pg_trgm` and `fuzzystrmatch`, two extensions that ship with PostgreSQL and that the owner of a database may install. On a managed service, check that both are allowed (on Azure, in the `azure.extensions` parameter).

## Backups

Two things to save, together: the database, and the `/data` volume, which holds the attached files and the secret key. Without the secret key, Toppo starts with a new one: everyone is signed out, and the mail password must be entered again in **Settings › Email**.

```sh
umask 077
docker compose exec -T db pg_dump -U toppo -Fc toppo > toppo-$(date +%F).dump
docker run --rm -v toppo_toppo-data:/data -v "$PWD":/backup alpine \
  sh -c 'umask 077 && tar czf /backup/toppo-data-$(date +%F).tgz -C /data .'
```

Both commands run while Toppo is up. Keep the backups as private as the server: the dump holds every issue and the sessions, the archive the secret key that signs them; `umask 077` makes both readable by you alone. To back up every night, put them in a script next to `docker-compose.yml`, run it from cron, and copy the files to another machine: a backup on the same disk does not survive the disk.

```sh
#!/bin/sh
# backup.sh: the database and the volume of today, the last 14 days kept.
set -e
umask 077
cd "$(dirname "$0")"
mkdir -p -m 700 backups
docker compose exec -T db pg_dump -U toppo -Fc toppo > backups/toppo-$(date +%F).dump
docker run --rm -v toppo_toppo-data:/data -v "$PWD/backups":/backup alpine \
  sh -c 'umask 077 && tar czf /backup/toppo-data-$(date +%F).tgz -C /data .'
find backups -name 'toppo-*' -mtime +14 -delete
```

```sh
# crontab -e: every night at 3:30
30 3 * * * /srv/toppo/backup.sh
```

## Restore

Into a fresh installation, or over the current one after a mistake, from a database dump and a volume archive taken together:

```sh
docker compose stop toppo
docker compose up -d db
docker compose exec -T db dropdb -U toppo --if-exists toppo
docker compose exec -T db createdb -U toppo toppo
docker compose exec -T db pg_restore -U toppo -d toppo --no-owner < toppo-2026-10-25.dump
docker run --rm -v toppo_toppo-data:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/toppo-data-2026-10-25.tgz -C /data"
docker compose up -d
```

Run the same version of Toppo as the backup, or a newer one, which migrates it at startup: an older version does not know what a newer one wrote. Check that you can still sign in and open an attachment before relying on the restored instance.

## Upgrades

Read the [release notes](https://github.com/KevinBrt/toppo/releases) of the versions in between, back up, then:

```sh
# .env: IMAGE_TAG=<new version>
docker compose pull
docker compose up -d
```

Migrations run automatically at startup, all in one transaction: if one fails, Toppo refuses to start and the database is left as it was. Its logs say why.

- **How far**: Toppo upgrades directly from any of the three versions before it. From further behind, upgrade through versions in between, three at most at a time (0.1 → 0.4 → 0.7).
- **Going back**: migrations only go forward. To return to the previous version, restore the backup taken before the upgrade, with the previous `IMAGE_TAG`.
- **PostgreSQL**: the compose file pins a major version of PostgreSQL. Moving to the next one (when the compose file does) needs a dump and a restore: back up as above, stop everything, remove the `toppo_toppo-db` volume, start the new `db` alone and [restore](#restore) into it.

## Version and updates

The version running shows at the bottom of the sidebar, for everyone: give it when you report a problem.

Once a day, and at each start, Toppo asks GitHub for the latest version published (`api.github.com`, with its own version as the only thing it sends). When a newer one is out, those who manage the instance see it above their account, with what is new and how to upgrade; Toppo never upgrades itself. On a server cut from the internet, or to make no request at all, set `TOPPO_UPDATE_CHECK=false`.

## Security of the container

The image is distroless (no shell, no package manager) and runs as an unprivileged user. The provided compose file also makes the filesystem read-only, drops every Linux capability and forbids privilege escalation. Keep these settings if you write your own deployment.

## Troubleshooting

- **The setup code is lost**: restart Toppo (`docker compose restart toppo`): it prints a new one until setup is done.
- **The interface speaks the wrong language**: each person chooses theirs in **My account › Language**; emails follow it.
- **Toppo does not start**: `docker compose logs toppo` tells why: an unknown or invalid `TOPPO_*` variable, a database that cannot be reached, a migration that failed.
- **`/health` answers 503**: Toppo runs but cannot reach its database: check `docker compose ps` and the logs of `db`.
- **Links in emails point to the wrong address**: set `TOPPO_URL` to the address people open.
- **Everyone was signed out after a move**: the `/data` volume, with its secret key, was not moved along; restore it, or set `TOPPO_SECRET` yourself.
