# Review handoff — 2026-06 hardening + feature session

**Range to review:** `e881dde..4728578` on `main` (16 commits, 126 files, +6012/-1067).
**How to see it all:** `git log --oneline e881dde..4728578` · `git diff e881dde..4728578`
**Already validated by the author:** full suite green (db 7, shared 41, api 261, web 284), typecheck + lint clean, CI green on every pushed commit, and live end-to-end smoke tests on the 8088 stack. So this is NOT "does it run" — please review for **correctness, security, and money/RLS integrity depth**, and confirm the deferred items (bottom) are acceptable.

Everything originated from an automated 78-finding deep audit; these commits are the fixes + follow-on features. Please be adversarial — try to break the claims.

---

## How to spend review effort (by risk tier)

### TIER 1 — security / money / tenant isolation (review hardest)

1. **Refresh-token reuse containment — all 3 auth planes** · `d57b304`
   - Files: `apps/api/src/auth/auth.service.ts`, `platform/platform-auth.service.ts`, `devotee/devotee-auth.service.ts`
   - Claim: reuse-detection now revokes the whole token family in a SEPARATE transaction (the prior code revoked inside the throwing tx, so it rolled back). 
   - **Check:** the family revocation actually commits before the 401 throw on each plane; no path leaves a rotated token alive after a replay; staff plane now has containment it previously lacked.

2. **Devotee donations are pledges; income posts only on staff confirm** · `3fd3bc7`
   - Files: `apps/api/src/devotee/devotee-donations.service.ts`, `donations/donations.service.ts` (`confirm()`), `donations.controller.ts`
   - Claim: devotee self-service donations are `pledged` with NO ledger entry until staff `POST /donations/:id/confirm` (row-locked, pledged-only 409, posts income in the same tx).
   - **Check:** no path posts ledger income from the devotee plane directly; confirm is admin/finance only + idempotent (double-confirm → one posted entry); audit rows for `donation:confirm` + `ledger:post`.

3. **Finance integrity: attachment soft-delete + reconciled immutability** · `547f782`
   - Files: `apps/api/src/attachments/attachments.service.ts`, `ledger/ledger.service.ts`, migration `20260610010000_attachment_soft_delete`
   - Claim: attachments soft-delete only (DB `REVOKE DELETE`, deleted rows excluded from reads, staff role cannot delete financial-evidence owners); reconciled ledger entries reject edit/void until an audited `unreconcile`.
   - **Check:** no remaining hard-delete path on financial evidence; reconciled-guard covers donation edit/void AND manual ledger void; the demo audit endpoint is truly gone from the prod module tree.

4. **RLS: dynamic gate + break-glass RLS + Thai collation** · `8350d86`
   - Files: `packages/db/src/rls-check.ts`, migrations `20260610020000_break_glass_rls`, `20260610030000_thai_collation_names`, `infra/docker/rotate-db-passwords.sh`
   - Claim: rls:check now flags ANY table with a `tenant_id` column lacking FORCE RLS (was a static list that missed personnel/ceremonies). break_glass_grants got FORCE RLS.
   - **Check:** the dynamic query can't be fooled; every tenant table still has correct per-op policies; collation migration is data-safe; **note** rls:check is a script, NOT wired into CI (see deferred).

5. **Hall booking + monk invitations (new tenant tables)** · `b9dc3f5`
   - Files: `apps/api/src/ceremonies/ceremonies.service.ts` + `.controller.ts`, migration `20260611020000_halls_and_monk_invitations`, schema
   - Claim: `temple_halls` + `ceremony_monks` with FORCE RLS and **tenant-scoped composite FKs** (`ceremonies(tenant_id, hall_id)`, `ceremony_monks(tenant_id, ...)`); one active booking per hall/day (409); a monk can't be double-booked same day; monk ids validated as active monk/novice of the tenant.
   - **Check:** the composite FKs really prevent cross-tenant hall/monk references; the booking-conflict and monk-clash queries are correct under concurrency; `/ceremonies/halls` routes declared before `:id` so "halls" isn't captured as an id.

6. **Item-loan photos + owner binding** · `4728578` (the one already deep-reviewed; please re-verify)
   - Files: `apps/api/src/item-loans/item-loans.service.ts` + `.controller.ts`, `apps/web/src/features/item-loans/item-loans-view.tsx`, shared `item-loan.ts`, migration `20260612090000_item_loan_return_photos`
   - Claim: borrow/return require photo(s); each photo is bound to `owner_type='item_loan' AND owner_id=<the loan's item>`; web uploads with `loan.itemId` (a prior bug used `loan.id` → every return-photo upload 404'd).
   - **Check:** the binding holds on createLoan/approve/return; stock decrement/restore still atomic (row lock, no oversell, no double-decrement); audit rows intact. (See deferred: same binding NOT added to nothing else — it's complete here.)

7. **Account recovery + devotee email verification — NEW attack surface** · `9aa1251`
   - Files: `apps/api/src/common/recovery/recovery.service.ts`, `common/mail/mail.service.ts`, `auth.controller.ts` + `devotee-auth.controller.ts` (forgot/reset/verify), migration `20260611010000_auth_recovery_tokens`, web `recovery-view.tsx`
   - Claim: 32-byte tokens, sha256-stored, single-use via guarded `updateMany`, TTL-bound; forgot always 202 (no enumeration); reset revokes all refresh tokens; devotee email verify.
   - **Check (account-takeover surface — review hard):** token truly single-use under concurrency; no enumeration via timing or response shape (note: register endpoints DO still leak existence — see deferred); reset rejects disabled accounts; the log-transport (no SMTP) can't leak tokens to logs in prod; `auth_action_tokens` has the right grants (wat_migrate-only, no tenant_id).

8. **401 silent-refresh with logout fallback (web)** · `c8af8b4`
   - Files: `apps/web/src/features/auth/authed-fetch.ts`, `app.tsx`, `page-content.tsx`
   - Claim: on 401 → one shared refresh (in-flight dedup so concurrent 401s don't trip reuse-detection) → retry; logout only when refresh fails.
   - **Check:** the dedup actually serializes concurrent 401s; the retry uses the new token; no infinite refresh loop; refresh failure path clears session exactly once.

### TIER 2 — correctness

9. **NestJS 10→11 + Express 5 + config 4** · `1b57dd2` — body-parser errors now flow through the exception filter; verify 413/400 mapping in `common/filters/project-exception.filter.ts` + `app-setup.ts`; `http-transport.spec.ts` covers it. Audit went 12→2 (then →0 with #10).
10. **Timezone ICT (UTC+7)** · `fbd7e03` — `dashboard.service.ts` month boundaries + web `todayIso()`. Check no other `getUTC*`/`toISOString()` date-boundary logic remains that should be ICT.
11. **Staff UI money workflows + real audit page + `GET /audit`** · `e7ad158` — `audit.service.ts`/`audit.controller.ts` (admin/finance only, excludes before/after PII blobs); web audit page now uses real data; receipts/donations void+issue wired; tenant identity from profile (no hardcoded demo temple).

### TIER 3 — infra / supply chain

12. **xlsx → exceljs** · `e7d5e6a` — removed abandoned xlsx (2 HIGH advisories) from the user-upload parse path; `pnpm audit --prod` now clean; uuid override in root `package.json`.
13. **CI made real** · `f417a91` — `.github/workflows/ci.yml` now boots Postgres/Redis, migrates, `--frozen-lockfile`, builds docker images.
14. **Prod hardening** · `ce17712` — pruned API image, digest-pinned bases, Redis requirepass, resource limits, encrypted backups (`infra/docker/backup/`), CSP, `DEPLOY-TLS.md`.
15. **API security/ops quick wins** · `6926789` — argon2id OWASP params (test-env keeps light), REDIS_URL redaction, shutdown hooks, env-driven CORS, expanded env validation, /health DB ping, 12MB body limit scoped to /attachments, PDPA: stop fabricating donor consent.
16. **Demo credentials removed from bundle** · `17cdd10` — login demo quick-login + SmokeShell seed creds gone from the production bundle; `#/smoke` gated to platform-owner session.

---

## New migrations to review (all claim additive / data-safe)
`20260610010000_attachment_soft_delete` · `20260610020000_break_glass_rls` · `20260610030000_thai_collation_names` · `20260611010000_auth_recovery_tokens` · `20260611020000_halls_and_monk_invitations` · `20260612090000_item_loan_return_photos`
**Check:** each keeps FORCE RLS + grants correct; `thai_collation_names` `ALTER COLUMN ... COLLATE "th-x-icu"` is safe on existing rows; no destructive ops.

## Known deferred (do NOT re-file as new — confirm acceptable)
- **No mailer in prod by default** — recovery emails log-only unless `SMTP_URL` set (env-validated to require `PUBLIC_WEB_URL` in prod).
- **Register endpoints leak account existence** (login/forgot are non-enumerating; register is not) — staff + devotee.
- **Runtime DB connection is the Postgres superuser** + `SET ROLE wat_app`; committed role passwords in the foundation migration rely on `rotate-db-passwords.sh` (operational, not enforced).
- **rls:check not wired into CI**; **photo owner-binding** added to item-loans only (createLoan/approve/return) — consistent there.
- **Tokens in localStorage** (XSS exposure) — refresh-on-401 added, httpOnly cookies not.
- **No TLS in the stack itself** (operator terminates per `DEPLOY-TLS.md`); backups on same host until operator copies offsite; no WAL/PITR; no CD pipeline.
- **PDPA**: consent now honestly `false` (not fabricated) but no consent-capture UI or export/erasure endpoints.
- **No Playwright/browser e2e**; attachments stored as bytea in Postgres.

## Fast verification commands
```
cd temple
git diff e881dde..4728578              # full diff
pnpm -w typecheck && pnpm -w lint
pnpm -w test                           # migrates dev DB, seeds, runs db/shared/api/web
pnpm audit --prod                      # expect: no known vulnerabilities
pnpm --filter @wat/db run rls:check    # every tenant_id table FORCE RLS
```
