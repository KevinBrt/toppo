# HTTPS behind a reverse proxy

To reach Toppo from outside your network, put a reverse proxy in front of it that terminates HTTPS.

1. Set `TOPPO_URL=https://toppo.example.com`. Toppo then sends HSTS and upgrades insecure requests.
2. Publish Toppo's port on the server itself only, so that the proxy is the only way in: `HTTP_PORT=127.0.0.1:3000`.
3. Then set `TOPPO_TRUST_PROXY=true`, so that Toppo reads the client's address from the proxy's headers (sign-in rate limits rely on it). Never set it while Toppo's port is reachable directly: anyone could then claim any address.
4. Point the proxy at port 3000.

The proxy must let attachments through: up to 20 MB by default (`TOPPO_ATTACHMENT_MAX_SIZE_MB`).

## Caddy

Caddy gets the certificate itself and sets no size limit:

```
toppo.example.com {
  reverse_proxy localhost:3000
}
```

## nginx

nginx refuses request bodies over 1 MB unless told otherwise:

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

## The client's address

Toppo trusts the one proxy that connects to it: the client is the last address of `X-Forwarded-For`, the one that proxy added, whatever the client wrote before it. With a second proxy or a CDN in front, have the one next to Toppo replace the header with the address it trusts rather than append to it.

## Health checks

`GET /health` returns 200 when Toppo and its database are up, 503 otherwise: point the proxy's or the orchestrator's checks at it.
