# Codex Task 3 — Auth + RBAC + audit foundation

You are Codex acting as `backend-engineer` implementer for a Thai-first multi-tenant temple management SaaS.

## Non-negotiable workflow

Follow strict TDD:
1. Write failing tests first for auth/RBAC/tenant/audit behavior.
2. Run focused tests and confirm expected RED failures.
3. Implement the minimum production code/schema changes.
4. Re-run focused tests until GREEN.
5. Run package and repo verification commands and report real output.

Do not edit `apps/web/**` except `apps/web/src/lib/auth-client.ts` if needed by this task. Do not implement donor/donation/receipt UI yet.

## Project context

Repo: `/Users/innovera/wat-management-system/temple`
Stack: TypeScript, NestJS API, Prisma, PostgreSQL RLS, React+Tailwind web, pnpm monorepo.
Use `pnpm` or `corepack pnpm`.
Current branch: `task/1-project-scaffold`; repo currently has no baseline commit and many files are untracked.

Task 1 scaffold and Task 2 DB/RLS foundation are complete and verified.
Relevant docs:
- `docs/prompts/codex-mvp-1-tasks.md` Task 3
- `docs/architecture/mvp-1-domain-model.md`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260530000000_db_foundation_rls/migration.sql`

## Scope

Implement auth + RBAC + tenant context + audit foundation.

### Required behavior

- `POST /auth/login`
  - accepts email + password
  - verifies password with argon2
  - returns JWT access token and refresh token
  - token payload must include `sub` user id, `tenant_id`, `role`, `email`
  - invalid credentials return 401 using project error model
- `POST /auth/refresh`
  - refresh rotation: old refresh token cannot be reused
  - returns new access + refresh pair
- `POST /auth/logout`
  - revokes the provided refresh token
- Guards/decorators:
  - `AuthGuard`: blocks missing/invalid token with 401
  - `RolesGuard` + `@Roles(...)`: blocks insufficient role with 403
  - tenant guard/context: tenant id comes from JWT only; request helpers expose current user/tenant
  - `@CurrentUser`, `@CurrentTenant`, `@Roles`
- Common filters:
  - normalize project error model for 401/403/404/409/422
- Audit foundation:
  - audit module/service/interceptor that can write `audit_logs`
  - financial/domain mutation audit row must include tenant, actor, action, entity type/id, before/after metadata, reason if present, ip, timestamp
  - Provide at least one test-only/demo protected mutation endpoint that writes an audit row through the interceptor/service so tests prove the audit path really works. Keep it clearly test/demo scoped; do not implement donor/donation business logic.

### Required DB/schema adjustments

Task 2 schema did not yet include auth/audit fields. Add a new additive migration, do not rewrite the already-applied Task 2 migration unless absolutely necessary.

Minimum additions:
- `users.password_hash text` sufficient for login seed/test users
- refresh token persistence, e.g. `auth_refresh_tokens` tenant-owned table with RLS or equivalent secure table:
  - id, tenant_id, user_id, token_hash, expires_at, revoked_at, replaced_by_token_id?, created_at
  - enforce tenant consistency for user reference
- `audit_logs` should support before/after/reason/ip clearly. Prefer explicit columns if practical:
  - `before jsonb`, `after jsonb`, `reason text`, `ip text`
  - keep metadata for extension

Update Prisma schema/migrations accordingly.

### Seed/dev credentials

Update seed so the two demo tenants have login-capable users. Use deterministic dev passwords only for local seed, and document them in README or seed comments if appropriate. Do not put production secrets in source.

Suggested dev password for all seeded users: `Password123!`.

### Files expected

Create/modify as needed:
- `apps/api/src/auth/**`
- `apps/api/src/common/guards/**`
- `apps/api/src/common/decorators/**`
- `apps/api/src/common/filters/**`
- `apps/api/src/common/interceptors/**`
- `apps/api/src/audit/**`
- `apps/api/test/**/*.spec.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/**`
- `packages/db/prisma/seed.ts`
- `packages/db/src/**` if needed
- `apps/web/src/lib/auth-client.ts` only if useful and scoped
- package.json dependencies as needed (`argon2`, `@nestjs/jwt`, `passport-jwt` or lightweight JWT implementation, etc.)

## Tests to write first

At minimum:
- login success returns token payload with tenant+role
- login bad password returns 401
- protected endpoint without token returns 401
- role-protected endpoint with insufficient role returns 403
- refresh rotation: reusing old refresh token returns 401 or 409
- logout revokes refresh token
- tenant comes from JWT, not request body/header
- audit test: protected mutation creates `audit_logs` row with tenant+actor+action+after+ip

Prefer API integration tests under `apps/api/test/` using Nest testing + supertest.

## Acceptance criteria

- unauthorized is blocked with 401
- insufficient permission is blocked with 403
- login/logout/refresh works
- tenant is derived from JWT only
- audit log writes real DB row for protected mutation
- RLS remains intact
- no hard-coded production secrets
- global checks pass

## Commands to run and include in final report

Use real outputs:

```bash
pnpm install
export DATABASE_URL=postgresql://wat_dev:<dev-password>@localhost:5432/wat_dev?schema=public
pnpm --filter @wat/db prisma validate
pnpm --filter @wat/db prisma migrate reset --force --skip-seed
pnpm --filter @wat/db build
pnpm --filter @wat/db seed
pnpm --filter @wat/db rls:check
pnpm --filter @wat/db test
pnpm --filter @wat/api test
pnpm --filter @wat/api typecheck
pnpm --filter @wat/api lint
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

If DATABASE_URL password is needed, read it from the running Docker container env; do not print the secret in final output.

## Important quality constraints

- Keep scope to Task 3; do not implement donor/donation/receipt features.
- Keep financial hard-delete protections from Task 2 passing.
- Do not grant tenant app role access to platform tables.
- Do not trust tenant id from request body/header.
- Use parameterized queries / Prisma where possible; avoid raw SQL injection.
- If exact production-grade auth is too large, implement a clean MVP foundation with tests and document unresolved production hardening clearly.

## Output required

At the end, report:
- changed files
- exact commands run + pass/fail summary
- unresolved issues/blockers
- implementation notes about JWT/refresh/RBAC/tenant/audit

Do not claim success unless commands actually ran.
