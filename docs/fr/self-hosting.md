# Héberger Toppo

Toppo est livré en une seule image Docker (`ghcr.io/kevinbrt/toppo`, amd64 et arm64) qui a besoin de PostgreSQL 16 ou plus récent. Le fichier compose fourni lance les deux.

## Ce qu’il vous faut

- Un serveur Linux 64 bits, un NAS ou un Raspberry Pi avec Docker Engine et Docker Compose v2 (`docker compose version`).
- Environ 1 Go de mémoire pour une petite équipe, et de la place disque pour la base de données et les fichiers joints.
- Pour joindre Toppo depuis l’extérieur de votre réseau : un nom de domaine et un reverse proxy qui termine le HTTPS ([plus bas](#derriere-un-reverse-proxy-https)).

## Installer

```sh
mkdir -m 700 toppo && cd toppo
curl -fsSLO https://raw.githubusercontent.com/KevinBrt/toppo/main/docker/docker-compose.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env && chmod 600 .env
docker compose up -d
```

`docker compose ps` montre les deux services `healthy` une fois prêts. Toppo répond sur le port 3000. Le dossier et `.env` sont à vous seul : `.env` garde le mot de passe de la base de données, et plus tard les réglages que vous ajoutez.

Avant d’aller plus loin, ajoutez à `.env` l’adresse que les gens ouvriront, et la version à faire tourner (voir les [versions publiées](https://github.com/KevinBrt/toppo/releases)) :

```sh
TOPPO_URL=https://toppo.example.com
IMAGE_TAG=1.0.0
```

`TOPPO_URL` sert dans chaque lien que Toppo envoie : invitations, réinitialisations de mot de passe, notifications. `IMAGE_TAG` vaut `latest` par défaut, qui suit les versions publiées : fixez une version en production et mettez à jour quand vous le décidez. Appliquez un changement de `.env` avec `docker compose up -d`.

## Premier démarrage

1. Lisez le code d’installation dans les journaux :

   ```sh
   docker compose logs toppo | grep "setup code"
   ```

   La ligne ressemble à `Toppo is not set up yet: open http://localhost:3000 and enter the setup code ABCD-EFGH-JKLM`. Un nouveau code s’affiche à chaque démarrage tant que l’installation n’est pas faite.

2. Ouvrez Toppo, entrez le code et créez le premier compte administrateur.
3. Configurez l’e-mail dans **Paramètres › E-mail** (plus bas).
4. Invitez votre équipe depuis **Paramètres › Membres** : chaque personne reçoit un lien personnel, valable 7 jours, envoyé par e-mail s’il est configuré, ou que vous lui transmettez vous-même. Elle choisit son nom et son mot de passe en l’ouvrant.
5. Ajustez ce que chaque rôle permet dans **Paramètres › Rôles et permissions**. Administrateur, Équipe et Demandeur ne sont qu’un point de départ : renommez-les, modifiez-les ou créez les vôtres.

Le code existe pour que personne d’autre ne s’approprie une instance neuve joignable depuis le réseau. Une fois le premier administrateur créé, l’assistant est fermé pour de bon. Pour les déploiements automatisés, fixez le code d’avance avec `TOPPO_SETUP_CODE`.

## E-mail

Toppo envoie invitations, réinitialisations de mot de passe et notifications par votre serveur d’envoi : saisissez son hôte, son port, sa sécurité (STARTTLS, TLS, ou aucune pour un relais de votre propre réseau), le compte et l’adresse d’expédition dans **Paramètres › E-mail**, puis envoyez-vous un message de test depuis la même page. Le mot de passe est chiffré avec la clé secrète de l’instance.

Sans e-mail, Toppo fonctionne, mais les liens d’invitation se transmettent à la main, les notifications restent dans la cloche, et **un mot de passe oublié ne peut pas être réinitialisé** : configurez l’e-mail avant que quelqu’un en ait besoin.

## Configuration

Les réglages sont des variables d’environnement, définies dans `.env` à côté de `docker-compose.yml`. La liste complète, avec les valeurs par défaut, est dans [`.env.example`](https://github.com/KevinBrt/toppo/blob/main/.env.example).

- Les variables `TOPPO_*` sont lues par Toppo. Une variable `TOPPO_*` inconnue arrête le serveur avec un message explicite : une faute de frappe ne passe jamais inaperçue.
- Toute variable `TOPPO_*` peut être lue depuis un fichier : `TOPPO_DATABASE_URL_FILE=/run/secrets/database_url` (secrets Docker ou Kubernetes).
- `IMAGE_TAG` et `HTTP_PORT` ne changent que `docker-compose.yml` (version de l’image et port publié).

## Derrière un reverse proxy (HTTPS)

1. Définissez `TOPPO_URL=https://toppo.example.com`. Toppo envoie alors HSTS et fait passer les requêtes non sécurisées en HTTPS.
2. Publiez le port de Toppo sur le serveur lui-même seulement, pour que le proxy soit le seul chemin d’entrée : `HTTP_PORT=127.0.0.1:3000`.
3. Définissez ensuite `TOPPO_TRUST_PROXY=true`, pour que Toppo lise l’adresse du client dans les en-têtes du proxy (les limites de connexion en dépendent). Ne le faites jamais tant que le port de Toppo est joignable directement : n’importe qui pourrait alors se donner n’importe quelle adresse. Toppo fait confiance au seul proxy qui s’y connecte : le client est la dernière adresse de `X-Forwarded-For`, celle que ce proxy a ajoutée, quoi que le client ait écrit avant. Avec un second proxy ou un CDN devant, faites remplacer l’en-tête par l’adresse de confiance par le proxy voisin de Toppo, plutôt que d’y ajouter.
4. Faites pointer le proxy sur le port 3000. Contrôles de santé : `GET /health` répond 200 quand Toppo et sa base de données fonctionnent, 503 sinon.

Le proxy doit laisser passer les pièces jointes : jusqu’à 20 Mo par défaut (`TOPPO_ATTACHMENT_MAX_SIZE_MB`).

Avec Caddy, qui obtient lui-même le certificat et ne fixe aucune limite de taille :

```
toppo.example.com {
  reverse_proxy localhost:3000
}
```

Avec nginx, qui refuse les corps de requête de plus de 1 Mo sauf indication contraire :

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

## Pièces jointes

On joint des fichiers aux tickets et aux commentaires : images (PNG, JPEG, WebP), PDF, texte et journaux, CSV, fichiers Word, Excel et PowerPoint, et leurs équivalents OpenDocument.

- **Taille** : 20 Mo par fichier par défaut ; `TOPPO_ATTACHMENT_MAX_SIZE_MB` la change (de 1 à 1024). Au plus 20 fichiers sur la demande d’un ticket, et sur chaque commentaire.
- **Contrôles** : le type que nomme l’extension d’un fichier doit correspondre à son contenu, lu par le serveur ; tout le reste est refusé (SVG, HTML, archives, exécutables…). Images et fichiers texte s’affichent dans l’application, les PDF s’ouvrent dans la visionneuse du navigateur, tout autre fichier se télécharge ; le navigateur n’exécute jamais rien d’un fichier.
- **Stockage** : les fichiers sont gardés dans le volume `/data`, sous `uploads/`, nommés par des clés aléatoires. Toppo n’accepte plus de fichiers tant qu’il y reste moins de 1 Go libre. Les fichiers retirés, ou laissés par des tickets et des projets supprimés, quittent le disque dans l’heure.

## Utiliser un PostgreSQL existant

Retirez le service `db` de `docker-compose.yml` et définissez `TOPPO_DATABASE_URL`, par exemple `postgres://toppo:password@db.example.com:5432/toppo?sslmode=require`. L’utilisateur doit être propriétaire de la base : Toppo crée et migre ses tables au démarrage, et installe `pg_trgm` et `fuzzystrmatch`, deux extensions livrées avec PostgreSQL que le propriétaire d’une base peut installer. Sur un service managé, vérifiez que les deux sont permises (sur Azure, dans le paramètre `azure.extensions`).

## Sauvegardes

Deux choses à sauvegarder, ensemble : la base de données, et le volume `/data`, qui garde les fichiers joints et la clé secrète. Sans la clé secrète, Toppo démarre avec une nouvelle : tout le monde est déconnecté, et le mot de passe de l’e-mail doit être saisi de nouveau dans **Paramètres › E-mail**.

```sh
umask 077
docker compose exec -T db pg_dump -U toppo -Fc toppo > toppo-$(date +%F).dump
docker run --rm -v toppo_toppo-data:/data -v "$PWD":/backup alpine \
  sh -c 'umask 077 && tar czf /backup/toppo-data-$(date +%F).tgz -C /data .'
```

Les deux commandes s’exécutent pendant que Toppo tourne. Gardez les sauvegardes aussi privées que le serveur : le dump contient chaque ticket et les sessions, l’archive la clé secrète qui les signe ; `umask 077` les rend lisibles par vous seul. Pour sauvegarder chaque nuit, mettez-les dans un script à côté de `docker-compose.yml`, lancez-le par cron, et copiez les fichiers sur une autre machine : une sauvegarde sur le même disque ne survit pas au disque.

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

## Mises à jour

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

## Version et mises à jour disponibles

La version qui tourne s’affiche en bas de la barre latérale, pour tout le monde : donnez-la quand vous signalez un problème.

Une fois par jour, et à chaque démarrage, Toppo demande à GitHub la dernière version publiée (`api.github.com`, avec sa propre version pour seule information envoyée). Quand une plus récente est sortie, ceux qui gèrent l’instance la voient au-dessus de leur compte, avec ce qui est nouveau et comment mettre à jour ; Toppo ne se met jamais à jour tout seul. Sur un serveur coupé d’internet, ou pour ne faire aucune requête, définissez `TOPPO_UPDATE_CHECK=false`.

## Sécurité du conteneur

L’image est distroless (pas de shell, pas de gestionnaire de paquets) et tourne sous un utilisateur sans privilèges. Le fichier compose fourni rend aussi le système de fichiers en lecture seule, retire toutes les capacités Linux et interdit l’escalade de privilèges. Gardez ces réglages si vous écrivez votre propre déploiement.

## Dépannage

- **Le code d’installation est perdu** : redémarrez Toppo (`docker compose restart toppo`) : il en affiche un nouveau tant que l’installation n’est pas faite.
- **L’interface parle la mauvaise langue** : chaque personne choisit la sienne dans **Mon compte › Langue** ; les e-mails la suivent.
- **Toppo ne démarre pas** : `docker compose logs toppo` dit pourquoi : une variable `TOPPO_*` inconnue ou invalide, une base de données injoignable, une migration qui a échoué.
- **`/health` répond 503** : Toppo tourne mais n’atteint pas sa base de données : vérifiez `docker compose ps` et les journaux de `db`.
- **Les liens des e-mails pointent vers la mauvaise adresse** : définissez `TOPPO_URL` sur l’adresse que les gens ouvrent.
- **Tout le monde a été déconnecté après un déménagement** : le volume `/data`, avec sa clé secrète, n’a pas suivi ; restaurez-le, ou définissez vous-même `TOPPO_SECRET`.
