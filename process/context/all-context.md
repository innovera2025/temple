# wat-management-system — Project Context Router

> This file (`process/context/all-context.md`) is the authoritative context router for
> both Claude and Codex. Read it first, then open the grouped/source docs it points to.
> Regenerate with the `vc-generate-context` skill.

- Last updated: 2026-06-16
- Repo HEAD (commit): `c0b2819`
- Mode: Full Scan
- Package manager: pnpm@9.15.4

---

## 1. Product and PRD context

ระบบจัดการวัด (Thai-first temple management system) for real-world temple operations —
donations, receipts/anumodana, accounting, monks/staff, donors/laypeople, events &
ceremonies, inventory, reports, users/permissions, audit logs & backup.

**Audiences (3 canonical access groups):**
- `platform_owner` — Innovera platform operators; sign in via the platform plane (`/platform`).
- `temple_owner` — tenant `admin` (วัด owner/manager).
- `temple_user` — tenant `finance` / `staff` capability subroles.
- ญาติโยม (devotees) — self-service plane (`/devotee`): pick any temple, donate, view history.
- `auditor`/`viewer` are **not** product runtime roles (do not reintroduce without DB/seed/API/test work).

**Product rules** (authoritative copy in `CLAUDE.project.md`):
- Financial records are never hard-deleted — use void/cancel with reason.
- Donations, receipts, expenses, and permission changes must write audit logs.
- Every financial document gets a unique, traceable document number.
- Thai language first.

PRD/spec docs: `docs/product/design-ui-map.md`, `docs/architecture/mvp-1-domain-model.md`,
`docs/plans/mvp-1-build-plan.md`, review notes under `docs/reviews/`.

## Technology Stack

- **Monorepo:** pnpm workspaces + Turborepo (`turbo.json`, `pnpm-workspace.yaml`).
- **API:** NestJS 11 + Express (`@wat/api`, `apps/api`).
- **Web:** React + Vite + Tailwind CSS (`@wat/web`, `apps/web`); dependency-light, hand-rolled router.
- **DB layer:** Prisma + PostgreSQL with Row-Level Security (`@wat/db`, `packages/db`).
- **Shared:** `@wat/shared` (`packages/shared`) — CJS, dependency-free validators/labels shared by web + api.
- **Config:** `@wat/config` (`packages/config`).
- **Cache/limits:** Redis.
- **Tests:** Vitest across all packages.
- **Deploy:** Docker Compose + nginx (`infra/docker`).

## Repository Structure

```
apps/
  api/    @wat/api  — NestJS REST API (modules per domain)
  web/    @wat/web  — React + Vite SPA (staff back-office + devotee + platform + public)
packages/
  db/      @wat/db      — Prisma schema, raw-SQL migrations, RLS, seed
  shared/  @wat/shared  — CJS validators, labels, access-model (no deps)
  config/  @wat/config  — shared config
infra/docker/  — docker-compose.prod.yml, nginx.conf, Dockerfiles
docs/          — architecture, product, plans, prompts, reviews
process/       — agent harness context + plans (this dir)
```

Workspace globs (`pnpm-workspace.yaml`): `apps/*`, `packages/*`.

## 4. Package manager and scripts

Package manager: **pnpm@9.15.4**. Root scripts (Turbo-driven):

| Script | Command |
|--------|---------|
| build | `turbo build` |
| dev | `turbo dev` |
| lint | `turbo lint` |
| typecheck | `turbo typecheck` |
| test | `@wat/db` migrate deploy → build → test → seed, then `turbo test --filter=!@wat/db --concurrency=1` |

Per-package: each of `@wat/api`, `@wat/web`, `@wat/shared`, `@wat/config` has `build/dev?/lint/test/typecheck`.
`@wat/db` adds `prisma`, `seed`, `rls:check`.

Common targeted commands:
- Web: `pnpm --filter @wat/web typecheck|lint|test`
- API: `pnpm --filter @wat/api typecheck|lint|test`
- After editing `@wat/shared`, rebuild it before the API typechecks against its built `dist`.

## 5. TypeScript and module resolution

- `@wat/shared` must remain **CJS** (consumed by both NestJS api and Vite web).
- **Web** resolves `@wat/shared` to its **TS source** via Vite alias
  (`apps/web/vite.config.ts` → `packages/shared/src/index.ts`), so the web app sees source directly.
- **API** consumes the **built `dist`** of `@wat/shared` — rebuild shared after editing it or api typecheck lags.

## 6. API and backend

NestJS modules under `apps/api/src` (one folder per domain):
`auth`, `platform`, `devotee`, `donors`, `donations`, `receipts`, `ledger`, `ceremonies`,
`personnel`, `inventory`, `item-loans`, `attachments`, `audit`, `reports`, `dashboard`,
`temple`, `users`, `public`, `health`, plus `common` and `config`. Bootstrap: `apps/api/src/main.ts`,
`apps/api/src/app.module.ts`, `apps/api/src/app-setup.ts`.

- **Three auth planes** separated by JWT `typ` claim: staff (`/auth`), platform (`/platform/auth`),
  devotee (`/devotee/auth`). Refresh tokens per plane (`AuthRefreshToken`, `PlatformRefreshToken`,
  `DevoteeRefreshToken`); break-glass via `BreakGlassGrant`.
- Tenant isolation enforced at the DB layer (RLS), not just in guards — see §7.
- Advisory locks (`pg_advisory_xact_lock`) guard concurrency-sensitive flows (ledger postings,
  ceremony/hall bookings, item-loan settlement).

## 7. Database and data layer

- Prisma schema: `packages/db/prisma/schema.prisma` (~31 models). Migrations: raw SQL files under
  `packages/db/prisma/migrations` (~29), applied with **`migrate deploy`** (not `dev`) so RLS / partial
  indexes don't trip drift detection.
- **Row-Level Security:** `withTenant` (`SET LOCAL ROLE wat_app` + tenant_id) for tenant tables;
  `withSystemAccess` (`wat_migrate`, RLS-bypass) for platform/global tables. `FORCE ROW LEVEL SECURITY`.
  RLS-using services: `apps/api/src/donations`, `donors`, `ledger`, `receipts`, `ceremonies`,
  `item-loans`, `auth`, `devotee` (see each `*.service.ts`).
- **Money** stored as integer **satang** (`BigInt`). No hard delete (`REVOKE DELETE`); void/cancel instead.
- **Append-only audit:** `AuditLog` (tenant) + `PlatformAuditLog` (platform). Unique doc numbers via `DocCounter`.
- Key models: `Temple`, `User`, `Donor`, `Donation`, `Receipt`, `LedgerAccount`, `LedgerEntry`,
  `ReconciliationPeriod`, `Ceremony`/`TempleHall`/`CeremonyMonk`, `Personnel`, inventory + item-loan
  models, `Attachment`, `DevoteeAccount`, `PlatformUser`, `TempleApplication`.

## 8. Auth, payments, and integrations

- Auth: JWT (HS, `JWT_SECRET`) + per-plane refresh tokens; password reset / email verification via
  `AuthActionToken`. Social login (Google/Facebook) is **scaffolded but not wired end-to-end**
  (no `/oauth/callback`) — the staff login shows the buttons with a "coming soon" notice;
  `AUTH_FLOW_AVAILABILITY.socialLogin = false`.
- Payments: donations are recorded in-app (satang); devotee donations are **pledges** that post to the
  ledger only on staff confirmation. No external payment gateway integrated yet.
- Redis: caching / rate-limiting.

## 9. UI and styling

- React + Vite SPA at `apps/web`. Tailwind CSS + a small design-system in `apps/web/src/design-system`
  and tokens/classes in `apps/web/src/styles.css`.
- **Routing is path-based** (hand-rolled, no router dep — `apps/web/src/app.tsx`):
  `/` = public landing directory, `/temple` = staff product, `/devotee` = devotee portal,
  `/platform` = Innovera console. Auxiliary flows stay hash-based (`#/reset-password`,
  `#/verify-email`, `#/smoke`); legacy `#/devotee|#/platform|#/public` links still resolve.
- Feature views under `apps/web/src/features/*` (auth, dashboard, donations, donors, receipts, ledger,
  ceremonies, personnel, inventory, item-loans, attachments, audit, reports, temple, users, devotee,
  platform, public). Design-backed staff pages live in `apps/web/src/features/design-backed-pages.tsx`.
- Shared login shell: `apps/web/src/features/auth/auth-shell.tsx` (split-screen brand panel + auth card),
  reused by all three login planes.

## 10. Environment variables

Names only (see `.env.example`; never commit values):
`NODE_ENV`, `API_PORT`, `WEB_PORT`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `JWT_SECRET`,
`BACKUP_PASSPHRASE`, `WEB_PUBLIC_PORT`, `VITE_API_BASE_URL`, `TRUST_PROXY`.

- `VITE_API_BASE_URL` defaults to `/api` (same-origin via the nginx proxy; baked at web build time).
- `WEB_PUBLIC_PORT` defaults to `80` in `infra/docker/docker-compose.prod.yml`; the local smoke stack
  overrides it to `8088`.

## 11. Linting, formatting, and quality

- ESLint per package (`turbo lint`); TypeScript `--noEmit` typecheck (`turbo typecheck`).
- No Prettier / no enforced indent rule in eslint config (`eslint.config.js`).
- Vitest for unit/component tests (web uses jsdom + `react-dom/server` / `createRoot` in tests).

## 12. Conventions and rules

- Thai-first copy throughout.
- Every endpoint/action: validation + permission check + audit (for financial/sensitive data) + tests.
- Write acceptance criteria before implementing; summarize changed files + how to verify.
- Validators/labels are dependency-free in `@wat/shared` and shared by web + api (single source of truth).
- ICT (UTC+7) civil dates via shared `ictMonth` / `ictDateIso` helpers.
- Full engineering + product rules: `CLAUDE.project.md`.

## 13. Security posture

- DB-enforced tenant isolation (RLS + `FORCE ROW LEVEL SECURITY`), not guard-only.
- Append-only audit logs (tenant + platform); no hard delete on financial data.
- Secrets via env (`JWT_SECRET`, `DATABASE_URL`, `BACKUP_PASSPHRASE`); nginx security headers +
  `index.html` no-cache (`infra/docker/nginx.conf`); `TRUST_PROXY` for correct client IPs behind nginx.
- Encrypted backups gated by `BACKUP_PASSPHRASE`.

## 14. Monitoring and operations

- Health: `apps/api/src/health` + nginx `/healthz`.
- Deploy: `infra/docker/docker-compose.prod.yml` (api/web/db/redis); web served by nginx, `/api` proxied.
- Local smoke stack: `docker compose -p wat-smoke -f infra/docker/docker-compose.prod.yml --env-file /tmp/wat-smoke.env up -d --build` on port **8088**.

## 15. References and key files

- Product/engineering rules: `CLAUDE.project.md`
- Domain model: `docs/architecture/mvp-1-domain-model.md`
- Design/UI map: `docs/product/design-ui-map.md`
- Build plans: `docs/plans/mvp-1-build-plan.md`, `docs/plans/item-loans-build-plan.md`, `docs/plans/design-ui-implementation-plan.md`
- Reviews/handoffs: `docs/reviews/`
- DB schema: `packages/db/prisma/schema.prisma`
- API bootstrap: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- Web entry/router: `apps/web/src/app.tsx`; styles: `apps/web/src/styles.css`
- Deploy: `infra/docker/docker-compose.prod.yml`, `infra/docker/nginx.conf`

## 16. Open Questions

- The agent harness `process/` is only partially scaffolded: this file (`process/context/all-context.md`)
  exists, but the development-protocols, general-plans, and features directories were not created because
  the installer delivered the harness globally (`~/.claude`) without project seed templates. Create those
  dirs (and migrate the docs/plans into process/general-plans) if/when the full kit is available.
- `CLAUDE.project.md` is a backup of the original project `CLAUDE.md` (kept before the harness install);
  its content is summarized above. Decide whether to keep `CLAUDE.project.md` or fold it fully here.
- Social-login OAuth is unfinished (no callback) — finish or remove the scaffolding.
- `docs/plans/design-ui-implementation-plan.md` references the pre-landing-page routing; refresh if it
  is still consulted.
