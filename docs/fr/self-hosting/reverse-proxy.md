# HTTPS derrière un reverse proxy

Pour joindre Toppo depuis l’extérieur de votre réseau, placez devant lui un reverse proxy qui termine le HTTPS.

1. Définissez `TOPPO_URL=https://toppo.example.com`. Toppo envoie alors HSTS et fait passer les requêtes non sécurisées en HTTPS.
2. Publiez le port de Toppo sur le serveur lui-même seulement, pour que le proxy soit le seul chemin d’entrée : `HTTP_PORT=127.0.0.1:3000`.
3. Définissez ensuite `TOPPO_TRUST_PROXY=true`, pour que Toppo lise l’adresse du client dans les en-têtes du proxy (les limites de connexion en dépendent). Ne le faites jamais tant que le port de Toppo est joignable directement : n’importe qui pourrait alors se donner n’importe quelle adresse.
4. Faites pointer le proxy sur le port 3000.

Le proxy doit laisser passer les pièces jointes : jusqu’à 20 Mo par défaut (`TOPPO_ATTACHMENT_MAX_SIZE_MB`).

## Caddy

Caddy obtient lui-même le certificat et ne fixe aucune limite de taille :

```
toppo.example.com {
  reverse_proxy localhost:3000
}
```

## nginx

nginx refuse les corps de requête de plus de 1 Mo sauf indication contraire :

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

## L’adresse du client

Toppo fait confiance au seul proxy qui s’y connecte : le client est la dernière adresse de `X-Forwarded-For`, celle que ce proxy a ajoutée, quoi que le client ait écrit avant. Avec un second proxy ou un CDN devant, faites remplacer l’en-tête par l’adresse de confiance par le proxy voisin de Toppo, plutôt que d’y ajouter.

## Contrôles de santé

`GET /health` répond 200 quand Toppo et sa base de données fonctionnent, 503 sinon : faites-y pointer les contrôles du proxy ou de l’orchestrateur.
