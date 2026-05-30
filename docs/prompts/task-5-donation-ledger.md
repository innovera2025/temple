# Claude Task 5 — Donation create/edit/void + auto-post income ledger

## Role

You are Claude (Sonnet/Opus) acting as the primary coding implementer for a Thai-first multi-tenant temple management SaaS. You implement one slice end-to-end, run the verification commands for real, and report exact output. An independent read-only reviewer checks your work afterward; do not claim success unless commands really ran.

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
- Task 4 — Donor registry (CRUD + search + audit, donor mutation + audit are atomic in one `withTenant` transaction)

Important existing rules (กฎร่วมทุก task):
- Multi-tenant: shared DB + `tenant_id` + RLS. Every query on a tenant table runs inside the existing `withTenant(tenantId, tx => …)` pattern (`set_config('app.tenant_id', $id, true)` inside a transaction). `tenant_id` comes from the JWT only — never trust body/header tenant IDs.
- **No hard delete for financial data.** Use void/cancel + reason. Missing reason on void/cancel/reissue → **422**.
- **Every financial mutation writes an audit log** bound to tenant + actor + timestamp, with `after` = the row after the change (never null), and `before` for edits/voids where practical.
- A financial mutation and its audit row must be written **atomically in the same transaction** (follow the Task 4 donor pattern in `apps/api/src/donors/donors.service.ts`).
- Error model: 401 (no token) / 403 (role) / 404 (cross-tenant) / 409 (number collision / concurrency / duplicate active) / 422 (validation, missing reason).
- Money is stored as **integer satang** in `BigInt` columns (`amount_satang`). Never use floats for money.
- Thai-first UX/copy.
- Do not rewrite already-verified foundation unless absolutely required.

## Goal

Implement Task 5 — Donation create / edit / void, with **atomic auto-posting of an income ledger entry**.

Recording a donation posts an income `ledger_entry` in the **same transaction** (atomic). Voiding a donation reverses everything (receipt if any → ledger → donation) in **one transaction**, each with its own audit row.

## Schema reality check (READ FIRST — the plan text predates the real schema)

The current `packages/db/prisma/schema.prisma` differs from the short Task 5 note in `codex-mvp-1-tasks.md`. Reconcile against the **actual** schema:

- `Donation` columns today: `tenantId`, `donorId?`, `amountSatang BigInt`, `currency`, `donationDate Date`, `status DonationStatus`, `note?`. There is **no** `method` column and **no** `fund`/`category` column yet.
- `DonationStatus = pledged | confirmed | cancelled` (default `confirmed`). There is **no** `recorded`/`voided` value. → "record a donation" = status `confirmed`; "void a donation" = status `cancelled`.
- `LedgerEntry`: `entryNo` (unique per tenant `@@unique([tenantId, entryNo])`), `accountId → LedgerAccount`, `amountSatang`, `entryDate Date`, `status LedgerEntryStatus`, `description?`. There is **no** link column back to the donation yet.
- `LedgerEntryStatus = draft | posted | voided` (no `cancelled`). → "reverse/cancel ledger" = set status `voided` (or post a reversing entry — see decision D3).
- `LedgerAccount`: `code` + `nameTh` + `accountType LedgerAccountType` (`asset|liability|equity|revenue|expense`), unique `(tenantId, code)`. Income posts to a `revenue` account.
- `DocCounter`: `(tenantId, docType, nextValue)` unique on `(tenantId, docType)` — use this to generate `entryNo` atomically.
- `AuditLog`: `action`, `entityType`, `entityId`, `before Json?`, `after Json?`, `reason?`, `metadata`.

Because of the above, **this task requires a Prisma migration** (a shared-path change — get orchestrator sign-off, like the `donor_registry_fields` migration in Task 4). The migration adds the donation fields and the donation↔ledger link (see "Schema changes" below).

## Open decisions — resolved with defaults (confirm or override before merge)

These were listed as blockers for Phase 4 in the build plan. To keep Claude Code unblocked, implement these defaults and flag them in the completion report as assumptions:

- **D1 — Payment method.** Add enum `DonationMethod = cash | bank_transfer | qr | other`, new column `donations.method` (default `cash`, required on create via API). Thai labels in `packages/shared`: เงินสด / โอนเงิน / QR / อื่น ๆ.
- **D2 — Fund / chart of accounts.** Do **not** build a full chart-of-funds UI in this slice. Seed **one default revenue account** per tenant (code `4000`, `nameTh` "เงินบริจาคทั่วไป", `accountType = revenue`) in `packages/db/prisma/seed.ts` if absent. Donation income posts to this account. Add **optional** `donations.fundAccountId` (FK → `ledger_accounts`, nullable); when null, post to the default `4000` revenue account. Resolve the account **inside** the tenant transaction and 422 if the resolved account is missing/not `revenue`/not active.
- **D3 — Void reversal style.** On void, **flip the posted income entry to status `voided`** (simplest, auditable) rather than posting a contra entry. Dashboard/summary queries must exclude non-`posted` entries and non-`confirmed` donations. (If the auditor later requires immutable contra entries, that is a follow-up slice.)
- **D4 — Donation ↔ ledger link.** Add nullable `ledger_entries.donation_id` (FK → `donations`, `@@index`) so the auto-posted entry is traceable and reversible. The reverse step finds the entry via this link.
- **D5 — Anonymous donations.** `donorId` stays optional (anonymous allowed). When present, it must belong to the same tenant (else 404).
- **D6 — Edit scope.** "Edit" = correct `amountSatang`, `donationDate`, `method`, `note`, `donorId`, `fundAccountId` on a `confirmed` donation. On amount/date/account change, **update the linked posted ledger entry in the same transaction** and write `donation:update` + `ledger:update` audit rows. Editing a `cancelled` donation → 409. Editing a donation that already has an **active (issued) receipt** → 409 (must void receipt first; receipts arrive in Task 6, so just guard for it now).

## Allowed scope

You may create/modify:
- `apps/api/src/donations/**`
- `apps/api/src/ledger/**` (income posting + reverse helper only — minimal; full ledger CRUD is Task 7)
- `apps/web/src/features/donations/**`
- `packages/shared/src/schemas/donation.ts` (+ shared enum/labels)
- `packages/db/prisma/schema.prisma` + a **new** migration under `packages/db/prisma/migrations/**` + `packages/db/prisma/seed.ts` (default revenue account)
- module registration needed to wire the feature (e.g. `apps/api/src/app.module.ts`)
- focused tests for donation/ledger API and donation UI

Touch only if strictly necessary, and explain why (shared/protected paths — orchestrator sign-off required):
- `apps/api/src/auth/**`, `apps/api/src/audit/**`, `apps/api/src/common/**`
- existing DB/RLS foundation migrations (do **not** edit past migrations — only add a new one)
- root config, `.github/**`, `infra/**`

## Requirements

### Schema changes (new migration)
- `donations`: add `method DonationMethod NOT NULL DEFAULT 'cash'`; add `fund_account_id UUID NULL` FK → `ledger_accounts(id)`.
- new enum `donation_method` (`cash|bank_transfer|qr|other`).
- `ledger_entries`: add `donation_id UUID NULL` FK → `donations(id)` + `@@index([donationId])`.
- Enable + FORCE RLS on any newly referenced tenant tables already covered by the foundation; the new columns inherit existing table RLS — verify with `rls:check`.
- Keep migration additive and reversible; do not break Task 2–4 migrations or seed.

### API
- **Create donation** (`admin`, `finance`, `staff`):
  - validate via `packages/shared/src/schemas/donation.ts`: `amountSatang` integer > 0; `method` in enum; `donationDate` valid date; `donorId?` UUID; `fundAccountId?` UUID; `note?`.
  - in **one** `withTenant` transaction: create donation (`status = confirmed`) → resolve revenue account (given `fundAccountId` or default `4000`) → generate `entryNo` via `DocCounter` (`docType = 'ledger_entry'`) → create `ledger_entry` (`status = posted`, `amountSatang` = donation amount, `entryDate = donationDate`, `donationId` set) → write `donation:create` audit (`after` = donation row) **and** `ledger:post` audit (`after` = entry row).
- **Edit donation** — per decision D6.
- **Void donation** (`admin`, `finance`; **reason required → 422 if missing**):
  - in **one** transaction: if an active (`issued`) receipt exists → void it (`receipt:void` audit) ; flip linked posted `ledger_entry` → `voided` (`ledger:cancel` audit, `before`/`after` rows) ; set donation `status = cancelled` (`donation:void` audit). No hard delete anywhere.
  - voiding an already-`cancelled` donation → 409.
- **List / get**: list & filter donations (by donor, method, date range, status); get by id. Cross-tenant id → 404.
- **Tenant isolation**: body/header tenant id must not affect access; only same-tenant donations are visible/mutable.
- **BigInt serialization**: `amountSatang` must be JSON-safe in responses (serialize `BigInt` → string or number consistently; document which). Do not let `BigInt` crash `JSON.stringify`.

### Web (`apps/web/src/features/donations/**`)
- Thai-first donation list with empty state (Thai text), basic filters (method, date, status), and a create form (amount in baht → convert to satang, method select, date, optional donor, optional note).
- A void action that requires a reason (Thai validation message).
- Modest UI — not final design polish.

### Tests
- `apps/api/test/donations.spec.ts` (and a focused ledger posting test):
  - create donation → income ledger entry posted atomically (entry exists, amount matches, `donationId` linked, `entryNo` present).
  - missing reason on void → 422.
  - void → donation `cancelled` + linked entry `voided` + (if present) receipt `voided`, each with its own audit row whose `after` is the changed row.
  - validation: amount ≤ 0 / non-integer → 422.
  - tenant isolation: tenant A donation/entry not visible to tenant B; cross-tenant get → 404.
  - edit recalculates the linked posted entry and audits `donation:update` + `ledger:update`.
  - `test:doc-number-concurrency` style check: concurrent create does not produce duplicate `entryNo` (rely on `(tenantId, entryNo)` unique + DocCounter).
  - existing Task 1–4 tests (DB/RLS, auth/RBAC/audit, donor) still pass.
- web tests for donation empty/list/create/void UI.

## Verification commands to run before finishing

Run focused first, then report exact output summary:

```bash
# schema/migration (this task changes Prisma):
pnpm --filter @wat/db prisma generate
pnpm --filter @wat/db prisma migrate reset --force
pnpm --filter @wat/db seed
pnpm --filter @wat/db rls:check

# tests + gates:
pnpm --filter @wat/api test
pnpm --filter @wat/web test
pnpm -w typecheck
pnpm -w lint
pnpm -w build
```

The orchestrator runs final global verification independently after you finish.

## Acceptance criteria (gate)

- finance/staff can record a donation; it appears in donor history and counts toward dashboard income totals.
- recording a donation posts exactly one `posted` income ledger entry in the **same transaction**, linked via `donation_id`.
- void reverses every related entity (receipt if any → ledger → donation) in **one transaction**, with separate audit rows whose `after` = the changed row; missing reason → 422.
- no hard delete anywhere; statuses move only confirmed → cancelled (donation), posted → voided (ledger), issued → voided (receipt).
- concurrent donation creation never yields duplicate `entryNo`.
- tenant isolation holds for donations and ledger entries.
- all global gates pass (typecheck, lint, test, build, rls:check).

## Non-goals (do NOT implement)

- Receipt issue/preview/PDF/numbering/reissue (Task 6) — only the **void-receipt-if-present** guard.
- Full ledger income/expense CRUD, manual expense entry, monthly summary UI (Task 7).
- Reconciliation / close period (Task 8), dashboard build-out (Task 9), reports/export (Task 9), platform admin (Task 11).
- Full chart-of-funds management UI (only the single seeded default revenue account here).
- public portal / booking / calendar / notifications (MVP-2).

## Completion report required

Return:
- changed files (incl. the new migration name)
- tests added/changed
- commands actually run + summarized output (must be from real runs)
- assumptions taken on D1–D6 (so the orchestrator can confirm/override)
- unresolved issues

Do not claim success unless commands really ran.
