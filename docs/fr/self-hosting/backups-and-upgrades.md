# Sauvegardes et mises à jour

## Sauvegarder

Deux choses à sauvegarder, ensemble : la base de données, et le volume `/data`, qui garde les fichiers joints et la clé secrète. Sans la clé secrète, Toppo démarre avec une nouvelle : tout le monde est déconnecté, et le mot de passe de l’e-mail doit être saisi de nouveau dans **Paramètres › E-mail**.

```sh
umask 077
docker compose exec -T db pg_dump -U toppo -Fc toppo > toppo-$(date +%F).dump
docker run --rm -v toppo_toppo-data:/data -v "$PWD":/backup alpine \
  sh -c 'umask 077 && tar czf /backup/toppo-data-$(date +%F).tgz -C /data .'
```

Les deux commandes s’exécutent pendant que Toppo tourne. Gardez les sauvegardes aussi privées que le serveur : le dump contient chaque ticket et les sessions, l’archive la clé secrète qui les signe ; `umask 077` les rend lisibles par vous seul.

### Chaque nuit

Mettez les commandes dans un script à côté de `docker-compose.yml`, lancez-le par cron, et copiez les fichiers sur une autre machine : une sauvegarde sur le même disque ne survit pas au disque.

```sh
#!/bin/sh
# backup.sh : la base et le volume du jour, les 14 derniers jours gardés.
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
# crontab -e : chaque nuit à 3 h 30
30 3 * * * /srv/toppo/backup.sh
```

## Restaurer

Dans une installation neuve, ou par-dessus l’actuelle après une erreur, depuis un dump de la base et une archive du volume pris ensemble :

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

Faites tourner la même version de Toppo que la sauvegarde, ou une plus récente, qui la migre au démarrage : une version plus ancienne ne connaît pas ce qu’une plus récente a écrit. Vérifiez que vous pouvez toujours vous connecter et ouvrir une pièce jointe avant de compter sur l’instance restaurée.

## Mettre à jour

Lisez les [notes de version](https://github.com/KevinBrt/toppo/releases) des versions intermédiaires, sauvegardez, puis :

```sh
# .env : IMAGE_TAG=<nouvelle version>
docker compose pull
docker compose up -d
```

Les migrations s’exécutent automatiquement au démarrage, toutes dans une transaction : si l’une échoue, Toppo refuse de démarrer et la base reste telle qu’elle était. Ses journaux disent pourquoi.

- **Jusqu’où** : Toppo se met à jour directement depuis n’importe laquelle des trois versions qui le précèdent. De plus loin, passez par des versions intermédiaires, trois au plus à chaque fois (1.0 → 0.4 → 0.7).
- **Revenir en arrière** : les migrations ne vont que vers l’avant. Pour revenir à la version précédente, restaurez la sauvegarde prise avant la mise à jour, avec l’`IMAGE_TAG` précédent.
- **PostgreSQL** : le fichier compose fixe une version majeure de PostgreSQL. Passer à la suivante (quand le fichier compose le fait) demande un dump et une restauration : sauvegardez comme ci-dessus, arrêtez tout, supprimez le volume `toppo_toppo-db`, démarrez le nouveau `db` seul et [restaurez](#restaurer) dedans.

## Savoir qu’une version est sortie

La version qui tourne s’affiche en bas de la barre latérale, pour tout le monde : donnez-la quand vous signalez un problème.

Une fois par jour, et à chaque démarrage, Toppo demande à GitHub la dernière version publiée (`api.github.com`, avec sa propre version pour seule information envoyée). Quand une plus récente est sortie, ceux qui gèrent l’instance la voient au-dessus de leur compte, avec ce qui est nouveau et comment mettre à jour ; Toppo ne se met jamais à jour tout seul. Sur un serveur coupé d’internet, ou pour ne faire aucune requête, définissez `TOPPO_UPDATE_CHECK=false`.
