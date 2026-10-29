# Configuration

Les réglages sont des variables d’environnement, définies dans `.env` à côté de `docker-compose.yml`, puis appliquées avec `docker compose up -d`. [`.env.example`](https://github.com/KevinBrt/toppo/blob/main/.env.example) les liste toutes, avec leurs valeurs par défaut.

- Les variables `TOPPO_*` sont lues par Toppo. Une variable `TOPPO_*` inconnue arrête le serveur avec un message explicite : une faute de frappe ne passe jamais inaperçue.
- Toute variable `TOPPO_*` peut être lue depuis un fichier, en ajoutant `_FILE` à son nom : `TOPPO_DATABASE_URL_FILE=/run/secrets/database_url` (secrets Docker ou Kubernetes).
- Le fichier compose transmet à Toppo les variables qu’il nomme sous `environment:`. Pour en définir une autre, comme une variante `_FILE`, ajoutez-la là aussi.

## Le fichier compose

Celles-ci ne changent que `docker-compose.yml` ; Toppo ne les lit jamais.

| Variable            | Par défaut | Ce qu’elle fait                                                            |
| ------------------- | ---------- | -------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | requise    | Le mot de passe du PostgreSQL fourni. Générez-le : `openssl rand -hex 32`. |
| `IMAGE_TAG`         | `latest`   | La version de Toppo à faire tourner. Fixez-en une en production.           |
| `HTTP_PORT`         | `3000`     | Le port publié sur l’hôte. `127.0.0.1:3000` derrière un reverse proxy.     |

## Toppo

| Variable                       | Par défaut                     | Ce qu’elle fait                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOPPO_URL`                    | `http://localhost:3000`        | L’adresse que les gens ouvrent, sans chemin. Sert dans chaque lien que Toppo envoie. Avec `https://`, Toppo envoie HSTS et fait passer les requêtes non sécurisées en HTTPS.                                                    |
| `TOPPO_DATABASE_URL`           | définie par le fichier compose | La chaîne de connexion PostgreSQL 16+. Définissez-la vous-même pour un [PostgreSQL existant](#utiliser-un-postgresql-existant).                                                                                                 |
| `TOPPO_TRUST_PROXY`            | `false`                        | Lit l’adresse du client dans les en-têtes d’un reverse proxy. Seulement quand Toppo n’est joignable que par ce proxy : voir [HTTPS derrière un reverse proxy](./reverse-proxy).                                                 |
| `TOPPO_LOG_LEVEL`              | `info`                         | `fatal`, `error`, `warn`, `info`, `debug`, `trace` ou `silent`.                                                                                                                                                                 |
| `TOPPO_SECRET`                 | générée                        | La clé qui signe les sessions et chiffre le mot de passe de l’e-mail, 32 caractères au moins. Laissée vide, Toppo en génère une dans `/data/secret.key`. Définissez-la quand plusieurs instances partagent une base de données. |
| `TOPPO_SETUP_CODE`             | aléatoire                      | Le code du [premier démarrage](./first-run). Fixez-le d’avance seulement pour les déploiements automatisés.                                                                                                                     |
| `TOPPO_ATTACHMENT_MAX_SIZE_MB` | `20`                           | Le plus gros fichier que l’on peut joindre, de 1 à 1024 Mo.                                                                                                                                                                     |
| `TOPPO_UPDATE_CHECK`           | `true`                         | Si Toppo demande chaque jour à GitHub la dernière version ([savoir qu’une version est sortie](./backups-and-upgrades#savoir-qu-une-version-est-sortie)).                                                                        |
| `TOPPO_DATA_DIR`               | `/data`                        | Où Toppo garde ses fichiers dans le conteneur. Rarement à changer.                                                                                                                                                              |
| `TOPPO_HOST`, `TOPPO_PORT`     | `0.0.0.0`, `3000`              | L’interface et le port qu’écoute Toppo dans le conteneur. Rarement à changer.                                                                                                                                                   |

## Pièces jointes

On joint des fichiers aux tickets et aux commentaires : images (PNG, JPEG, WebP), PDF, texte et journaux, CSV, fichiers Word, Excel et PowerPoint, et leurs équivalents OpenDocument.

- **Taille** : 20 Mo par fichier par défaut ; `TOPPO_ATTACHMENT_MAX_SIZE_MB` la change (de 1 à 1024). Au plus 20 fichiers sur la demande d’un ticket, et sur chaque commentaire. Un reverse proxy devant Toppo doit accepter des requêtes aussi grosses.
- **Contrôles** : le type que nomme l’extension d’un fichier doit correspondre à son contenu, lu par le serveur ; tout le reste est refusé (SVG, HTML, archives, exécutables…). Images et fichiers texte s’affichent dans l’application, les PDF s’ouvrent dans la visionneuse du navigateur, tout autre fichier se télécharge ; le navigateur n’exécute jamais rien d’un fichier.
- **Stockage** : les fichiers sont gardés dans le volume `/data`, sous `uploads/`, nommés par des clés aléatoires. Toppo n’accepte plus de fichiers tant qu’il y reste moins de 1 Go libre. Les fichiers retirés, ou laissés par des tickets et des projets supprimés, quittent le disque dans l’heure.

## Utiliser un PostgreSQL existant

Retirez le service `db` de `docker-compose.yml` et définissez `TOPPO_DATABASE_URL`, par exemple `postgres://toppo:password@db.example.com:5432/toppo?sslmode=require`. L’utilisateur doit être propriétaire de la base : Toppo crée et migre ses tables au démarrage, et installe `pg_trgm` et `fuzzystrmatch`, deux extensions livrées avec PostgreSQL que le propriétaire d’une base peut installer. Sur un service managé, vérifiez que les deux sont permises (sur Azure, dans le paramètre `azure.extensions`).
