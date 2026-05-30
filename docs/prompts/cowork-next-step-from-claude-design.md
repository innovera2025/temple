# Cowork Next Step — Convert Claude Design Extraction into Build Plan

## Context

We extracted the Claude Design source for the Thai temple management system and saved the function inventory here:

- `docs/reviews/claude-design-function-inventory.md`
- source artifact: `/Users/innovera/wat-management-system/artifacts/claude-design/temple-admin-index-from-save_files/_bootstrap.html`

The local repo is still at planning/scaffold stage. Treat the Claude Design as a product target/prototype, not final backend architecture.

## Goal

Turn the extracted design inventory into a concrete MVP-1 implementation backlog and then hand implementation to Codex in small verifiable slices.

## Required decision

Use **finance-first MVP-1**. Do not attempt to build the entire Claude Design in one pass.

MVP-1 must prioritize:

1. Multi-tenant foundation
2. Auth + RBAC + audit log
3. Donor registry
4. Donation create/edit/void workflow
5. Receipt / ใบอนุโมทนาบัตร issue/preview/void workflow
6. Ledger income/expense entries
7. Reconciliation / close period
8. Finance dashboard
9. Reports/export
10. Minimal Innovera platform admin for tenant/user management

Defer to MVP-2 unless explicitly required:

- Public ญาติโยม portal
- Booking services
- Public activity calendar
- Public notifications
- Full ceremony/activity workflows beyond basic records

## Task for Claude cowork

Read these files:

- `README.md`
- `CLAUDE.md`
- `docs/reviews/claude-design-function-inventory.md`
- `docs/reviews/function-gap-review.md`
- `docs/prompts/implementation-tasks.md`

Then produce/update:

1. `docs/plans/mvp-1-build-plan.md`
   - sequential implementation phases
   - each phase must be <= 1 day of coding work
   - each phase must include verification commands
   - each phase must list files/modules expected to change

2. `docs/architecture/mvp-1-domain-model.md`
   - entities, fields, relationships
   - tenancy boundaries
   - role/permission matrix
   - audit events

3. `docs/prompts/codex-mvp-1-tasks.md`
   - Codex-ready prompts, one task per slice
   - each prompt must include context, requirements, files to inspect/change, tests to run, and acceptance criteria
   - first Codex task must be project scaffold only

## Important constraints

- Do not implement code yet unless explicitly told.
- Do not broaden scope into public portal or booking/calendar unless marking as MVP-2.
- Do not copy prototype demo-state assumptions into production schema without reviewing finance/audit requirements.
- Receipt numbering, voiding, and reissue rules must be explicit and auditable.
- Every finance action must be tied to tenant, actor, timestamp, and audit event.

## Output format

Return a short summary with:

- What changed
- Open decisions for the user
- The first 3 Codex tasks to run next
- Any blockers
