# Backups and upgrades

## Backing up

Two things to save, together: the database, and the `/data` volume, which holds the attached files and the secret key. Without the secret key, Toppo starts with a new one: everyone is signed out, and the mail password must be entered again in **Settings › Email**.

```sh
umask 077
docker compose exec -T db pg_dump -U toppo -Fc toppo > toppo-$(date +%F).dump
docker run --rm -v toppo_toppo-data:/data -v "$PWD":/backup alpine \
  sh -c 'umask 077 && tar czf /backup/toppo-data-$(date +%F).tgz -C /data .'
```

Both commands run while Toppo is up. Keep the backups as private as the server: the dump holds every issue and the sessions, the archive the secret key that signs them; `umask 077` makes both readable by you alone.

### Every night

Put the commands in a script next to `docker-compose.yml`, run it from cron, and copy the files to another machine: a backup on the same disk does not survive the disk.

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

## Restoring

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

## Upgrading

Read the [release notes](https://github.com/KevinBrt/toppo/releases) of the versions in between, back up, then:

```sh
# .env: IMAGE_TAG=<new version>
docker compose pull
docker compose up -d
```

Migrations run automatically at startup, all in one transaction: if one fails, Toppo refuses to start and the database is left as it was. Its logs say why.

- **How far**: Toppo upgrades directly from any of the three versions before it. From further behind, upgrade through versions in between, three at most at a time (1.0 → 0.4 → 0.7).
- **Going back**: migrations only go forward. To return to the previous version, restore the backup taken before the upgrade, with the previous `IMAGE_TAG`.
- **PostgreSQL**: the compose file pins a major version of PostgreSQL. Moving to the next one (when the compose file does) needs a dump and a restore: back up as above, stop everything, remove the `toppo_toppo-db` volume, start the new `db` alone and [restore](#restoring) into it.

## Knowing a new version is out

The version running shows at the bottom of the sidebar, for everyone: give it when you report a problem.

Once a day, and at each start, Toppo asks GitHub for the latest version published (`api.github.com`, with its own version as the only thing it sends). When a newer one is out, those who manage the instance see it above their account, with what is new and how to upgrade; Toppo never upgrades itself. On a server cut from the internet, or to make no request at all, set `TOPPO_UPDATE_CHECK=false`.
