# Codex Task 2 — DB schema foundation + RLS + tenant context + seed

You are Codex acting as `db-architect` implementer for a Thai-first multi-tenant temple management SaaS.

## Non-negotiable workflow

Follow strict TDD:
1. Write failing tests first for the DB helper behavior / RLS requirements you can test from this package.
2. Run the focused test and confirm it fails for the expected reason.
3. Implement the minimum code/schema/scripts.
4. Re-run the focused tests until green.
5. Run package and repo verification commands and report real output.

Do not edit `apps/web/**` for this task. Do not implement API/auth/donation UI yet.

## Project context

Repo: `/Users/innovera/wat-management-system/temple`
Stack: TypeScript, NestJS API, Prisma, PostgreSQL RLS, React+Tailwind web, pnpm monorepo.
Use `corepack pnpm` if `pnpm` is not on PATH.

Current branch: `task/1-project-scaffold`.
Task 1 scaffold exists. Task 2 adds DB foundation only.

## Scope

Implement DB schema foundation + RLS + tenant context + seed.

### Required models

Platform tables, no `tenant_id`, no tenant RLS:
- `temples`
- `platform_users`
- `temple_applications`
- `platform_audit_logs`

Tenant tables, all have `tenant_id uuid not null` and RLS:
- `users`
- `donors`
- `donations`
- `receipts`
- `ledger_accounts`
- `ledger_entries`
- `reconciliation_periods`
- `doc_counters`
- `attachments`
- `audit_logs`

Use names that match Prisma conventions but ensure actual SQL tables match snake_case names above via `@@map`/`@map` if needed.

### Required RLS behavior

- Create helper function:
  `current_tenant_id() = NULLIF(current_setting('app.tenant_id', true), '')::uuid`
- Every tenant table must have:
  - `ENABLE ROW LEVEL SECURITY`
  - `FORCE ROW LEVEL SECURITY`
  - SELECT policy with `USING (tenant_id = current_tenant_id())`
  - INSERT policy with `WITH CHECK (tenant_id = current_tenant_id())`
  - UPDATE policy with `USING (...) WITH CHECK (...)`
- If tenant context is missing, tenant queries must return 0 rows or fail safely. They must not leak rows.

### Required DB roles and privileges

- `wat_app`: runtime role, `NOBYPASSRLS`, not migration role
- `wat_migrate`: migration/DDL role
- Revoke dangerous actions:
  - REVOKE DELETE on `donations`, `receipts`, `ledger_entries`, `doc_counters`
  - REVOKE UPDATE and DELETE on `audit_logs`

If exact local role setup is constrained by dev Postgres permissions, implement SQL idempotently and document any local limitation. Still include migration SQL.

### Required package files

Create/modify:
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/**`
- `packages/db/prisma/seed.ts`
- `packages/db/src/prisma.ts`
- `packages/db/src/tenant-context.ts`
- `packages/db/src/rls-check.ts`
- `packages/db/src/index.ts`
- tests under `packages/db/tests/`:
  - `rls-isolation.spec.ts`
  - `no-hard-delete.spec.ts`
  - `document-number-concurrency.spec.ts`
- SQL/init if needed under `infra/postgres/init/**`
- `packages/db/package.json` scripts/dependencies as needed
- `.env.example` / README only if required for DB commands

### Seed data

Seed:
- 2 active temples/tenants
- users with 3 tenant roles minimum: admin, finance, staff
- sample ledger accounts for each tenant

### Document numbering

Implement enough doc counter logic/test to prove unique sequential receipt/ledger numbers per tenant under concurrent calls. It can live in `packages/db/src/tenant-context.ts` or a dedicated exported helper.

### Acceptance criteria

- Prisma schema validates.
- Migration from empty DB can run.
- Seed can run.
- RLS check script proves all tenant tables have RLS enabled and forced.
- Isolation test proves tenant A cannot read/write tenant B data and missing context leaks 0 rows.
- No-hard-delete test proves app role cannot delete financial rows.
- Doc number concurrency test proves unique doc numbers per tenant.

## Commands to run and include in final report

Use these or equivalent if scripts are adjusted:

```bash
corepack pnpm --filter @wat/db test
corepack pnpm --filter @wat/db typecheck
corepack pnpm --filter @wat/db lint
corepack pnpm --filter @wat/db build
corepack pnpm --filter @wat/db prisma validate
corepack pnpm --filter @wat/db prisma migrate dev --name db_foundation_rls
corepack pnpm --filter @wat/db seed
corepack pnpm --filter @wat/db rls:check
```

Also run global checks if feasible:

```bash
corepack pnpm -w typecheck
corepack pnpm -w lint
corepack pnpm -w test
corepack pnpm -w build
```

If Docker/Postgres is required, start only the db service:

```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d db
```

## Output required

At the end, report:
- changed files
- exact commands run and pass/fail summary
- any unresolved issue/blocker
- important implementation notes about RLS/roles/tenant context

Do not claim success unless commands actually ran.
