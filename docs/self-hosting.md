# Self-hosting Toppo

Toppo ships as one Docker image (`ghcr.io/kevinbrt/toppo`, amd64 and arm64) that needs PostgreSQL 16 or newer. The provided compose file runs both: on a server with Docker, Toppo is up in a few minutes.

```sh
mkdir -m 700 toppo && cd toppo
curl -fsSLO https://raw.githubusercontent.com/KevinBrt/toppo/main/docker/docker-compose.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env && chmod 600 .env
docker compose up -d
docker compose logs toppo | grep "setup code"
```

Open `http://localhost:3000`, enter the setup code from the logs and create the administrator account. The pages below take it from there, in the order you will need them.

| Page                                                         | What it covers                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [Install](./self-hosting/install)                            | What the server needs, the install, the version to run, what the container allows |
| [First run](./self-hosting/first-run)                        | The setup code, the first administrator, inviting the team, adjusting roles       |
| [Configuration](./self-hosting/configuration)                | Every `TOPPO_*` variable, secrets in files, attachments, an existing PostgreSQL   |
| [Email](./self-hosting/email)                                | Invitations, password resets and notifications through your mail server           |
| [HTTPS behind a reverse proxy](./self-hosting/reverse-proxy) | Caddy, nginx, the client's address, health checks                                 |
| [Backups and upgrades](./self-hosting/backups-and-upgrades)  | Backing up, restoring, upgrading, knowing a new version is out                    |
| [Troubleshooting](./self-hosting/troubleshooting)            | What to do when something does not work                                           |
