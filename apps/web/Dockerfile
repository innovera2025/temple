# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# @wat/web — React + Vite SPA, served by nginx (production image).
# Build context MUST be the repo root (pnpm workspace).
#   docker build -f apps/web/Dockerfile -t wat-web .
# VITE_API_BASE_URL is baked at BUILD time (Vite inlines import.meta.env). The
# default "/api" pairs with the nginx reverse proxy in infra/docker/nginx.conf
# so the browser talks to the API same-origin (no CORS needed).
# ---------------------------------------------------------------------------

# Digest-pinned — see apps/api/Dockerfile note on refreshing deliberately.
FROM node:22-bookworm-slim@sha256:7af03b14a13c8cdd38e45058fd957bf00a72bbe17feac43b1c15a689c029c732 AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# @wat/web depends on @wat/shared (built JS), so build shared first.
RUN pnpm --filter @wat/shared build \
  && pnpm --filter @wat/web build

# ---- runner: static assets on nginx ------------------------------------------
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS runner
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
