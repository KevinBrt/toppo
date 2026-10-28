# syntax=docker/dockerfile:1
#
# Toppo production image: one container serving the API and the compiled web app.
# Build from the repository root:  docker build -f docker/Dockerfile -t toppo .
#
# Base images are pinned by digest; Dependabot proposes updates.
ARG NODE_IMAGE=node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:cb606325b7ec4af55462cb0b424a53b452a5b4a894ffe841fcf1048d216fb9f8

# ---------------------------------------------------------------------------------------------
# Keep only the package manifests needed by the server and the web app, so the dependency
# layers below are cached until a package.json or the lockfile changes.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS prune
WORKDIR /src
RUN npm install --global --ignore-scripts turbo@2.11.9
COPY . .
RUN turbo prune @toppo-tracker/server @toppo-tracker/web --docker --out-dir /out/all \
 && turbo prune @toppo-tracker/server --docker --out-dir /out/server

# ---------------------------------------------------------------------------------------------
# Build JavaScript once, on the build machine's architecture: the output is platform-independent.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /src
ENV CI=true
COPY .npmrc ./
COPY --from=prune /out/all/json/ ./
RUN npm ci
COPY --from=prune /out/all/full/ ./
# Root files that `turbo prune` does not carry over.
COPY tsconfig.base.json ./
RUN npx turbo run build --filter=@toppo-tracker/server --filter=@toppo-tracker/web \
 && mkdir -p /data-skeleton

# ---------------------------------------------------------------------------------------------
# Production dependencies of the server, installed for the target architecture.
FROM ${NODE_IMAGE} AS runtime-deps
WORKDIR /src
ENV CI=true
COPY .npmrc ./
COPY --from=prune /out/server/json/ ./
# Without optional and peer packages either: Better Auth names vitest, drizzle-kit… as optional
# peers, which npm keeps (`devOptional`) since the monorepo has them for development, shipping
# build tools and their vulnerabilities. The server needs none: its optional packages are build
# tools' binaries, and the test helpers take vitest as a peer.
RUN npm ci --omit=dev --omit=optional --omit=peer \
 # Workspace packages are bundled into the server; their symlinks would dangle.
 && rm -rf node_modules/@toppo-tracker \
 # npm may keep some server dependencies next to the server instead of hoisting them.
 && mkdir -p apps/server/node_modules

# ---------------------------------------------------------------------------------------------
# Runtime: distroless (no shell, no package manager), non-root user 65532.
FROM ${RUNTIME_IMAGE} AS runtime
ARG VERSION=dev
LABEL org.opencontainers.image.title="Toppo" \
      org.opencontainers.image.description="Modern issue tracking. Self-hosted. Free forever." \
      org.opencontainers.image.source="https://github.com/KevinBrt/toppo" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${VERSION}"

WORKDIR /app
ENV NODE_ENV=production
COPY --from=runtime-deps /src/node_modules ./node_modules
COPY --from=runtime-deps /src/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /src/apps/server/dist ./apps/server/dist
COPY --from=build /src/apps/web/dist ./apps/web/dist
COPY --from=build /src/packages/db/migrations ./packages/db/migrations
COPY --from=build --chown=65532:65532 /data-skeleton /data

USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/nodejs/bin/node", "/app/apps/server/dist/healthcheck.js"]
CMD ["--enable-source-maps", "/app/apps/server/dist/main.js"]
