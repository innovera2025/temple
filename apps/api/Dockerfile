# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# @wat/api — NestJS API (production image).
# Build context MUST be the repo root: this is a pnpm workspace and the build
# needs the lockfile + every package manifest + sources.
#   docker build -f apps/api/Dockerfile -t wat-api .
# Stages: base -> builder -> (migrate | runner).
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base
# Prisma's query engine needs OpenSSL + CA certs at build and run time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- builder: install all deps, generate Prisma client, build the workspace ---
FROM base AS builder
# `prisma generate` reads the datasource env even though it does not connect; a
# placeholder keeps the build hermetic (the real URL is injected at run time).
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder

# Copy only manifests first so `pnpm install` is cached across source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# Now bring the sources (host node_modules/dist are excluded by .dockerignore).
COPY . .

# Generate the Prisma client, then build shared -> db -> api (dependency order).
RUN pnpm --filter @wat/db exec prisma generate \
  && pnpm --filter @wat/shared build \
  && pnpm --filter @wat/db build \
  && pnpm --filter @wat/api build

# ---- migrate: one-off image that applies migrations, then exits ---------------
# Reuses the builder (Prisma CLI + schema + migrations + DATABASE_URL at run time).
# `migrate deploy` only applies committed migrations — it never resets or seeds.
FROM builder AS migrate
ENV DATABASE_URL=""
CMD ["pnpm", "--filter", "@wat/db", "exec", "prisma", "migrate", "deploy"]

# ---- runner: lean-ish runtime, non-root --------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV API_PORT=3000
# Bring the built workspace. node_modules keeps pnpm's symlink graph (incl. the
# generated Prisma client) intact, so it must be copied whole — not a subset.
COPY --from=builder --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 3000
# No curl/wget in slim — probe with Node itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
