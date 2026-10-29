# Configuration

Settings are environment variables, set in `.env` next to `docker-compose.yml`, then applied with `docker compose up -d`. [`.env.example`](https://github.com/KevinBrt/toppo/blob/main/.env.example) lists them all, with their defaults.

- `TOPPO_*` variables are read by Toppo. An unknown `TOPPO_*` variable stops the server with an explicit message, so a typo never goes unnoticed.
- Any `TOPPO_*` variable can be read from a file instead, by adding `_FILE` to its name: `TOPPO_DATABASE_URL_FILE=/run/secrets/database_url` (Docker or Kubernetes secrets).
- The compose file passes Toppo the variables it names under `environment:`. To set another one, such as a `_FILE` variant, add it there too.

## The compose file

These only change `docker-compose.yml`; Toppo never reads them.

| Variable            | Default  | What it does                                                                 |
| ------------------- | -------- | ---------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | required | The password of the bundled PostgreSQL. Generate it: `openssl rand -hex 32`. |
| `IMAGE_TAG`         | `latest` | The version of Toppo to run. Pin one in production.                          |
| `HTTP_PORT`         | `3000`   | The port published on the host. `127.0.0.1:3000` behind a reverse proxy.     |

## Toppo

| Variable                       | Default                 | What it does                                                                                                                                                                                 |
| ------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOPPO_URL`                    | `http://localhost:3000` | The address people open, without a path. Used in every link Toppo sends. With `https://`, Toppo sends HSTS and upgrades insecure requests.                                                   |
| `TOPPO_DATABASE_URL`           | set by the compose file | The PostgreSQL 16+ connection string. Set it yourself for an [existing PostgreSQL](#using-an-existing-postgresql).                                                                           |
| `TOPPO_TRUST_PROXY`            | `false`                 | Reads the client's address from a reverse proxy's headers. Only when Toppo is reachable through that proxy alone: see [HTTPS behind a reverse proxy](./reverse-proxy).                       |
| `TOPPO_LOG_LEVEL`              | `info`                  | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`.                                                                                                                              |
| `TOPPO_SECRET`                 | generated               | The key that signs sessions and encrypts the mail password, 32 characters at least. Left empty, Toppo generates one into `/data/secret.key`. Set it when several instances share a database. |
| `TOPPO_SETUP_CODE`             | random                  | The [first-run](./first-run) code. Preset it only for automated deployments.                                                                                                                 |
| `TOPPO_ATTACHMENT_MAX_SIZE_MB` | `20`                    | The largest file people may attach, from 1 to 1024 MB.                                                                                                                                       |
| `TOPPO_UPDATE_CHECK`           | `true`                  | Whether Toppo asks GitHub once a day for the latest version ([knowing a new version is out](./backups-and-upgrades#knowing-a-new-version-is-out)).                                           |
| `TOPPO_DATA_DIR`               | `/data`                 | Where Toppo keeps its files inside the container. Rarely needs changing.                                                                                                                     |
| `TOPPO_HOST`, `TOPPO_PORT`     | `0.0.0.0`, `3000`       | The interface and port Toppo listens on inside the container. Rarely need changing.                                                                                                          |

## Attachments

People attach files to issues and to comments: images (PNG, JPEG, WebP), PDF, text and logs, CSV, Word, Excel and PowerPoint files, and their OpenDocument counterparts.

- **Size**: 20 MB per file by default; `TOPPO_ATTACHMENT_MAX_SIZE_MB` changes it (1 to 1024). At most 20 files on an issue's request, and on each comment. A reverse proxy in front of Toppo must accept requests that large too.
- **Checks**: the type a file's extension names must match its content, read by the server; anything else is refused (SVG, HTML, archives, executables…). Images and text files are shown in the app, PDFs open in the browser's own viewer, every other file is downloaded; the browser never runs anything of a file.
- **Storage**: files are kept in the `/data` volume, under `uploads/`, named by random keys. Toppo stops accepting files while less than 1 GB is free there. Files removed, or left by deleted issues and projects, leave the disk within the hour.

## Using an existing PostgreSQL

Remove the `db` service from `docker-compose.yml` and set `TOPPO_DATABASE_URL`, for example `postgres://toppo:password@db.example.com:5432/toppo?sslmode=require`. The user needs to own the database: Toppo creates and migrates its tables at startup, and installs `pg_trgm` and `fuzzystrmatch`, two extensions that ship with PostgreSQL and that the owner of a database may install. On a managed service, check that both are allowed (on Azure, in the `azure.extensions` parameter).
