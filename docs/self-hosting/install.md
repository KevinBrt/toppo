# Install

## What you need

- A 64-bit Linux server, NAS or Raspberry Pi with Docker Engine and Docker Compose v2 (`docker compose version`).
- About 1 GB of memory for a small team, and disk space for the database and the attached files.
- To reach Toppo from outside your network: a domain name and a reverse proxy that terminates HTTPS ([HTTPS behind a reverse proxy](./reverse-proxy)).

## Install

```sh
mkdir -m 700 toppo && cd toppo
curl -fsSLO https://raw.githubusercontent.com/KevinBrt/toppo/main/docker/docker-compose.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env && chmod 600 .env
docker compose up -d
```

`docker compose ps` shows both services as `healthy` once ready. Toppo answers on port 3000. The folder and `.env` are yours alone: `.env` holds the database password, and later the settings you add.

## The address and the version

Before going further, add to `.env` the address people will open, and the version to run (see the [releases](https://github.com/KevinBrt/toppo/releases)):

```sh
TOPPO_URL=https://toppo.example.com
IMAGE_TAG=1.0.0
```

`TOPPO_URL` is used in every link Toppo sends: invitations, password resets, notifications. `IMAGE_TAG` defaults to `latest`, which follows releases: pin a version in production and upgrade on purpose. Apply a change of `.env` with `docker compose up -d`.

Next: [first run](./first-run).

## What the container allows

The image is distroless (no shell, no package manager) and runs as an unprivileged user. The provided compose file also makes the filesystem read-only, drops every Linux capability and forbids privilege escalation. Keep these settings if you write your own deployment.

Toppo keeps its files in the `/data` volume: the attachments, and the secret key it generates on first start, which signs sessions and encrypts the mail password. The database lives in a volume of its own. Both are what you [back up](./backups-and-upgrades).
