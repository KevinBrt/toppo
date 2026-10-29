# Installer

## Ce qu’il vous faut

- Un serveur Linux 64 bits, un NAS ou un Raspberry Pi avec Docker Engine et Docker Compose v2 (`docker compose version`).
- Environ 1 Go de mémoire pour une petite équipe, et de la place disque pour la base de données et les fichiers joints.
- Pour joindre Toppo depuis l’extérieur de votre réseau : un nom de domaine et un reverse proxy qui termine le HTTPS ([HTTPS derrière un reverse proxy](./reverse-proxy)).

## Installer

```sh
mkdir -m 700 toppo && cd toppo
curl -fsSLO https://raw.githubusercontent.com/KevinBrt/toppo/main/docker/docker-compose.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env && chmod 600 .env
docker compose up -d
```

`docker compose ps` montre les deux services `healthy` une fois prêts. Toppo répond sur le port 3000. Le dossier et `.env` sont à vous seul : `.env` garde le mot de passe de la base de données, et plus tard les réglages que vous ajoutez.

## L’adresse et la version

Avant d’aller plus loin, ajoutez à `.env` l’adresse que les gens ouvriront, et la version à faire tourner (voir les [versions publiées](https://github.com/KevinBrt/toppo/releases)) :

```sh
TOPPO_URL=https://toppo.example.com
IMAGE_TAG=1.0.0
```

`TOPPO_URL` sert dans chaque lien que Toppo envoie : invitations, réinitialisations de mot de passe, notifications. `IMAGE_TAG` vaut `latest` par défaut, qui suit les versions publiées : fixez une version en production et mettez à jour quand vous le décidez. Appliquez un changement de `.env` avec `docker compose up -d`.

Ensuite : le [premier démarrage](./first-run).

## Ce que le conteneur permet

L’image est distroless (pas de shell, pas de gestionnaire de paquets) et tourne sous un utilisateur sans privilèges. Le fichier compose fourni rend aussi le système de fichiers en lecture seule, retire toutes les capacités Linux et interdit l’escalade de privilèges. Gardez ces réglages si vous écrivez votre propre déploiement.

Toppo garde ses fichiers dans le volume `/data` : les pièces jointes, et la clé secrète qu’il génère au premier démarrage, qui signe les sessions et chiffre le mot de passe de l’e-mail. La base de données vit dans un volume à part. Ce sont les deux choses à [sauvegarder](./backups-and-upgrades).
