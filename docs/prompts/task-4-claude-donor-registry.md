# Claude Task 4 — Donor Registry

## Role

You are Claude Opus 4.8 acting as the primary coding implementer for a Thai-first multi-tenant temple management SaaS.

## Project context

Stack:
- TypeScript end-to-end
- NestJS API in `apps/api`
- Prisma + PostgreSQL Row-Level Security in `packages/db`
- React + Tailwind web app in `apps/web`
- Shared validation/types in `packages/shared`
- pnpm monorepo + Turborepo

Completed and verified foundation:
- Task 1 — project scaffold
- Task 2 — DB schema foundation + RLS + tenant context + seed
- Task 3 — Auth + RBAC + audit foundation

Important existing rules:
- Multi-tenant data must be isolated by `tenant_id` and RLS.
- Tenant context must come from JWT only; never trust body/header tenant IDs.
- Tenant table queries must use the existing tenant context pattern/service.
- No hard delete for financial data.
- Mutations that change important tenant data must write audit logs.
- Thai-first UX/copy.
- Do not rewrite already-verified foundation unless absolutely required.

## Goal

Implement Task 4 — Donor registry.

Build donor CRUD + search/filter + audit, with API tests and basic web UI.

## Allowed scope

You may create/modify:
- `apps/api/src/donors/**`
- `apps/web/src/features/donors/**`
- `packages/shared/src/schemas/donor.ts`
- module registration files needed to wire the feature, e.g. `apps/api/src/app.module.ts`
- focused tests for donor API/UI

Avoid modifying unless strictly necessary:
- `apps/api/src/auth/**`
- `apps/api/src/audit/**`
- `apps/api/src/common/**`
- existing DB/RLS foundation migrations
- root config

If you must touch protected/shared paths, keep the change minimal and explain why.

## Requirements

API:
- CRUD donors:
  - create donor
  - list/search/filter donors
  - get donor by id
  - update donor
- Donor fields from MVP spec:
  - `displayName` / name (Thai-first primary name)
  - optional `legalName`
  - optional `phone`
  - optional `lineId`
  - optional `email`
  - optional `address`
  - optional `tags[]`
  - optional `notes`
  - optional `consent`
- Use validation in `packages/shared/src/schemas/donor.ts`.
- Reject invalid input with project error model / 422.
- Permission:
  - `admin`, `finance`, `staff` can create/update/search/view donors.
  - auditor/viewer can read if those roles exist in current role enum; otherwise do not invent roles that break existing schema.
- Tenant isolation:
  - users can only see their own tenant's donors.
  - body/header tenant id must not affect access.
- Audit:
  - write audit row for `donor:create`
  - write audit row for `donor:update`
  - include useful `after` data; include `before` for update where practical.

Web:
- Add basic Thai-first donor registry UI under `apps/web/src/features/donors/**`.
- Must include empty state Thai text.
- Must include basic search/filter UI where reasonable for this slice.
- Keep UI modest; this is not final design polish.

Tests:
- API create/search success.
- API invalid input returns 422.
- tenant isolation: donor from tenant A is not visible to tenant B.
- audit row created on create/update.
- existing auth/RBAC/audit tests remain passing.
- web tests for donor empty/list/search UI if web components are added.

## Verification commands to run before finishing

Run at least focused commands first, then report exact output summary:

```bash
pnpm --filter @wat/api test
pnpm --filter @wat/web test
pnpm typecheck
pnpm lint
```

If you add/modify Prisma schema or migrations, also run:

```bash
pnpm --filter @wat/db prisma generate
pnpm --filter @wat/db prisma migrate reset --force
pnpm --filter @wat/db seed
pnpm --filter @wat/db rls:check
```

The orchestrator will run final global verification independently after you finish.

## Non-goals

Do not implement:
- donations
- receipts
- ledger posting
- dashboard metrics
- reports/export
- platform admin
- public portal/calendar/booking/notifications

## Completion report required

Return:
- changed files
- tests added/changed
- commands actually run and summarized output
- unresolved issues or assumptions

Do not claim success unless commands really ran.
