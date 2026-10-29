# Héberger Toppo

Toppo est livré en une seule image Docker (`ghcr.io/kevinbrt/toppo`, amd64 et arm64) qui a besoin de PostgreSQL 16 ou plus récent. Le fichier compose fourni lance les deux : sur un serveur avec Docker, Toppo tourne en quelques minutes.

```sh
mkdir -m 700 toppo && cd toppo
curl -fsSLO https://raw.githubusercontent.com/KevinBrt/toppo/main/docker/docker-compose.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env && chmod 600 .env
docker compose up -d
docker compose logs toppo | grep "setup code"
```

Ouvrez `http://localhost:3000`, entrez le code d’installation lu dans les journaux et créez le compte administrateur. Les pages ci-dessous prennent la suite, dans l’ordre où vous en aurez besoin.

| Page                                                               | Ce qu’elle couvre                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [Installer](./self-hosting/install)                                | Ce qu’il faut au serveur, l’installation, la version à faire tourner, ce que permet le conteneur |
| [Premier démarrage](./self-hosting/first-run)                      | Le code d’installation, le premier administrateur, inviter l’équipe, ajuster les rôles           |
| [Configuration](./self-hosting/configuration)                      | Chaque variable `TOPPO_*`, les secrets en fichiers, les pièces jointes, un PostgreSQL existant   |
| [E-mail](./self-hosting/email)                                     | Invitations, réinitialisations de mot de passe et notifications par votre serveur d’envoi        |
| [Webhooks](./self-hosting/webhooks)                                | Prévenir d’autres outils de ce qui arrive aux tickets, par des requêtes signées                  |
| [HTTPS derrière un reverse proxy](./self-hosting/reverse-proxy)    | Caddy, nginx, l’adresse du client, les contrôles de santé                                        |
| [Sauvegardes et mises à jour](./self-hosting/backups-and-upgrades) | Sauvegarder, restaurer, mettre à jour, savoir qu’une version est sortie                          |
| [Dépannage](./self-hosting/troubleshooting)                        | Que faire quand quelque chose ne marche pas                                                      |
