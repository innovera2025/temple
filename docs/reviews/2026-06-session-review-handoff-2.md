# Review handoff #2 — post-codex-fix + design-alignment session

**Range to review:** `4728578..f152476` on `main` (9 commits).
**See it all:** `git log --oneline 4728578..f152476` · `git diff 4728578..f152476` (35 files, +1718/-236)

This continues from handoff #1 (`docs/reviews/2026-06-session-review-handoff.md`, range `e881dde..4728578`). Codex reviewed #1 and returned 6 findings — **all are fixed in this range** (commit `15817e3`) and then independently re-checked by a 41-agent adversarial self-review. This handoff covers everything **after** the last reviewed commit.

**Already validated by the author:** full suite green (db, shared 44, api 269, web 289), `pnpm -w typecheck` + `pnpm -w lint` clean, and live end-to-end smoke on the 8088 stack (all roles log in; devotee/platform/staff flows exercised). So this is NOT "does it run" — review for **correctness, security, money/RLS integrity**, and confirm the deferred items (bottom) are acceptable.

---

## How to spend review effort (by risk tier)

### TIER 1 — the codex-finding fixes + finance hardening (review hardest)

1. **The 6 codex findings — fixed** · `15817e3`
   - Files: `apps/api/src/common/recovery/recovery.service.ts`, `apps/api/src/item-loans/item-loans.service.ts`, `apps/api/src/ceremonies/ceremonies.service.ts`, `apps/api/src/ledger/ledger-entries.service.ts`, `apps/api/src/public/public.service.ts`, `apps/web/src/features/auth/authed-fetch.ts`, `packages/shared/src/schemas/ledger.ts`
   - Claims: (F1) forgot-password delivery now runs OFF the request path (`RecoveryService.runInBackground`) → constant-time response, no existence-by-timing oracle. (F2) the three item-loan photo-existence queries add `deleted_at IS NULL` (a soft-deleted photo can't be hand-over evidence). (F3) per-tenant advisory xact lock (`lockTenantBookings`, ledger pattern) serializes the hall/monk check-then-act in ceremony create/update. (F4) re-activating a cancelled ceremony now re-checks the invited monks (not only on a date move). (F5) public upcoming-events + ledger summary default month use shared `ictMonth`/`ictDateIso` (UTC+7). (F6) authed-fetch logs out once per failed-refresh burst.
   - **Check:** each fix holds end-to-end; the advisory lock genuinely serializes across separate tx; F1 backgrounded errors never log the raw token; F4 has no other active-transition path that skips the monk re-check. (A 41-agent self-review already verified these — spot-check, don't re-do.)

2. **F6 latch regression fix** · `3a467bf`
   - File: `apps/web/src/features/auth/authed-fetch.ts` (+ `apps/api/src/inventory/inventory.service.ts`, `apps/api/src/dashboard/dashboard.service.ts`)
   - Claim: the first F6 fix used a permanent `sessionExpired` flag; since `authedFetch` is memo'd once and outlives logout, a SECOND expiry after re-login was silently swallowed. Replaced with a per-burst guard keyed on the failed-refresh promise identity (`loggedOutFor !== refresh`). Also: inventory `importItems` movement_date (a `@db.Date`) was UTC → now ICT; dashboard `ictMonth` now delegates to the shared helper.
   - **Check:** concurrent 401s still log out once; a later burst (post-re-login) logs out again; no infinite-refresh.

3. **Item-loan photos = protected, single-use evidence** · `cdfbe27`
   - Files: `apps/api/src/attachments/attachments.service.ts`, `apps/api/src/item-loans/item-loans.service.ts`
   - Claim: `item_loan` added to `FINANCIAL_EVIDENCE_OWNER_TYPES` (staff can no longer soft-delete hand-over photos; admin/finance can, audited). `ItemLoansService.assertPhotosUnused()` rejects (422) any photo already recorded as borrow/return proof of any loan in the tenant — blocks cross-loan replay and borrow-photo-as-return reuse; wired into createLoan/approveLoanRequest/returnLoan.
   - **Check (review hard):** the `jsonb_array_elements_text` reuse query is correct + RLS-scoped; the realistic sequential-reuse path is fully covered (createLoan holds the item row lock); the accepted residual is two EXACT-concurrent same-photo requests (no advisory lock added — confirm acceptable).

4. **Deleting financial evidence requires + records a reason** · `6c90830`
   - Files: `packages/shared/src/schemas/attachment.ts` (`validateDeleteAttachment`), `apps/api/src/attachments/attachments.service.ts` (`remove`), `apps/api/src/attachments/attachments.controller.ts`, `apps/web/src/features/attachments/attachments.ts`
   - Claim: for `FINANCIAL_EVIDENCE_OWNER_TYPES` an empty reason is rejected (422); the trimmed reason is persisted to `attachments.delete_reason` AND `audit_logs.reason`. Non-financial (donor) deletes stay reason-optional; the staff-403 still fires before the reason check.
   - **Check:** no financial-evidence delete path bypasses the reason; reason length bound; audit row carries the reason.

### TIER 2 — infra / correctness

5. **nginx never caches index.html** · `03fdf40`
   - File: `infra/docker/nginx.conf`
   - Claim: index.html had no Cache-Control, so a browser could serve a stale index.html referencing old (now-404) content-hashed assets after a deploy → blank app. Added `location = /index.html { Cache-Control: no-cache }`, **re-declaring the hardening headers there** (an add_header in a location drops the server-level ones).
   - **Check:** index.html → `no-cache`, `/assets/*` still `immutable`, and the CSP + X-Frame-Options etc. are still present on the HTML document (the re-declaration is complete, not partial).

### TIER 3 — UI alignment to the design (no logic/backend change — confirm that)

6. **Devotee portal restructure + lay-home + design polish** · `ee06f03`, `bd8f181`
   - Files: `apps/web/src/features/devotee/*` (devotee-portal, devotee-home [new], temple-page, temple-picker, devotee-shell, devotee-auth)
   - Claim: each action FORM moved into its own existing sidebar menu (การบริจาค/การจองพิธี/การยืมของ = form + history); a new "หน้าหลักของฉัน" lay dashboard (KPIs from the `my*` APIs, quick-action tiles, recent merit); an "active temple" chosen once (persisted to localStorage, cleared on logout) drives all action pages. No donate/ceremony/loan logic changed — the forms are the same components, only relocated/exported.
   - **Check:** no functionality removed; `clearActiveTemple()` on logout (no cross-user leak on a shared device); the devotee-home KPI reads are the same authenticated `my*` endpoints (no new data exposure).

7. **break-glass redesign + login password toggle + platform overview dashboard** · `ee06f03`, `f152476`
   - Files: `apps/web/src/features/platform/break-glass-view.tsx`, `apps/web/src/features/auth/login-view.tsx`, `apps/web/src/features/platform/platform-dashboard.tsx` [new] + platform-shell/portal
   - Claim: break-glass page restyled (no behavior change); login gained a show/hide password toggle; the platform console gained an overview dashboard (KPIs from `listTemples`/`listApplications`, status proportions, pending-application queue) as the new default landing — all other platform pages unchanged.
   - **Check:** these are presentational; confirm no permission/RLS change, the platform dashboard respects read-only `canWrite`, and the password toggle doesn't persist/leak the value.

---

## Known deferred (LOW — do NOT re-file; confirm acceptable)
- **Refresh-token concurrent double-refresh** can read as a replay and revoke the whole family (a user with two tabs racing a refresh may get logged out). Pre-existing, all 3 planes.
- **No DB partial-unique index** on a posted ledger entry per donation (application logic prevents double-posting; this would be defense-in-depth) + no explicit concurrent-confirm test.
- **Register endpoints still leak account existence** (login/forgot are non-enumerating; register is not) — staff + devotee. Carried over from handoff #1.
- **Item-loan exact-concurrent same-photo reuse** (sequential reuse is blocked; see TIER 1 #3).

## Fast verification
```
cd temple
git diff 4728578..f152476
pnpm -w typecheck && pnpm -w lint
pnpm -w test                          # db + shared(44) + api(269) + web(289)
pnpm audit --prod
pnpm --filter @wat/db run rls:check
```
