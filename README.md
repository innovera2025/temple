# ระบบจัดการวัด

Thai-first temple management system scaffold. This repository is currently MVP-1 foundation only: pnpm workspace, NestJS API health endpoint, React/Vite web shell, placeholder packages, local infrastructure, and CI.

No business logic, database schema, auth, finance workflows, donor records, receipts, ledger, or platform features are included in this scaffold.

## Prerequisites

- Node.js 22+
- Corepack enabled for pnpm
- Docker Desktop or a Docker-compatible runtime

## Setup

```sh
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

Copy `.env.example` to `.env` if you want local environment overrides. The example file contains development placeholders only and no real secrets.

## Development

Start local infrastructure:

```sh
docker compose -f infra/docker/docker-compose.dev.yml up -d
```

Start all apps:

```sh
pnpm -w dev
```

Start one app:

```sh
pnpm --filter @wat/api dev
pnpm --filter @wat/web dev
```

API health check:

```sh
curl -i http://localhost:3000/health
```

Local database seed creates demo tenant users for development only. All seeded users use password `Password123!`; example emails include `admin@wat-arun.example`, `finance@wat-arun.example`, and `staff@wat-arun.example`.

## Verify

```sh
pnpm -w typecheck
pnpm -w lint
pnpm -w test
pnpm -w build
```

## Workspace

- `apps/api` - NestJS API scaffold with `GET /health`
- `apps/web` - React, Vite, and Tailwind empty application shell
- `packages/db` - database package placeholder
- `packages/shared` - shared TypeScript package placeholder
- `packages/config` - shared configuration package placeholder
- `infra/docker` - development Docker compose services
