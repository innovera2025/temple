# Implementation Prompts — ระบบจัดการวัด

ใช้ prompt เหล่านี้กับ Claude Code / Codex ทีละ task หลังเลือก tech stack แล้ว

## Prompt 1 — Create project scaffold

```text
Implement the missing function: Project foundation / app scaffold

Context:
This is an empty repository for a Thai temple management system.

Goal:
Create a maintainable application scaffold with clear dev/test/build commands.

Requirements:
- Choose a practical full-stack web stack suitable for CRUD, reports, auth, and Thai-first UI.
- Add README with setup, development, test, build, and deployment notes.
- Add environment variable example file without secrets.
- Add base routing/layout/navigation.
- Add lint/test/build configuration.
- Add initial smoke test or equivalent verification.

Acceptance criteria:
- A developer can install dependencies and run the app locally.
- README commands work.
- Build/test command runs successfully.
- No real secrets are committed.

Before finishing:
- Show changed files.
- Run install/build/test commands.
- Summarize selected stack and why.
```

## Prompt 2 — Database schema foundation

```text
Implement the missing function: Database schema foundation

Context:
This is a Thai temple management system. The repository should support temple profile, users, donors, donations, receipts, accounting, and audit logs.

Goal:
Create the initial database schema/migrations and seed data for core MVP entities.

Requirements:
- Add schema/models for users, roles, permissions, temples, donors, donation_categories, donations, receipts, ledger_accounts, ledger_entries, attachments, audit_logs.
- Use stable IDs and created_at/updated_at timestamps.
- Add soft-delete or status fields for important records where appropriate.
- Prepare seed data for default roles and common donation categories: กฐิน, ผ้าป่า, ค่าน้ำไฟ, บำรุงวัด, สังฆทาน, อื่น ๆ.

Acceptance criteria:
- Migration/schema can be applied from a clean database.
- Seed command creates default roles/categories.
- Schema prevents duplicate receipt/document numbers.
- Existing build/tests still pass.
```

## Prompt 3 — Users, roles, and permissions

```text
Implement the missing function: Users, roles, and permissions

Context:
This Thai temple management system will contain financial records and personal data.

Goal:
Add authentication and role-based access control.

Requirements:
- Roles: admin, finance, temple_staff, monk_viewer, auditor.
- Admin can manage users and settings.
- Finance can manage donations, receipts, and accounting.
- Temple staff can manage events, ceremonies, donors, and inventory but not sensitive accounting settings.
- Monk viewer/report viewer can read assigned data only.
- Auditor can read reports/audit logs but not edit financial records.
- Protect all sensitive routes/actions with permission checks.

Acceptance criteria:
- Unauthorized users are blocked.
- Permission checks are tested.
- UI hides or disables actions the current role cannot use.
- Login/logout/session behavior works.
```

## Prompt 4 — Audit log foundation

```text
Implement the missing function: Audit log foundation

Context:
Financial and sensitive data in a temple management system must be traceable.

Goal:
Add reusable audit logging for create/update/void/delete-sensitive actions.

Requirements:
- Add audit_logs storage with actor, action, entity_type, entity_id, old_value, new_value, reason, timestamp, request metadata if available.
- Add helper/service for recording audit logs.
- Use audit logs for donation, receipt, ledger entry, user permission, and temple settings changes.
- Add admin/auditor read-only audit log UI with filters.

Acceptance criteria:
- Creating/updating/voiding financial records creates audit logs.
- Audit logs cannot be edited from normal UI.
- Auditor role can view audit logs.
- Tests cover at least one create and one update audit event.
```

## Prompt 5 — Donor CRM

```text
Implement the missing function: Donor / lay supporter CRM

Context:
Temple staff need to manage ญาติโยม/ผู้บริจาค and view donation history.

Goal:
Add donor profile management.

Requirements:
- CRUD donors with Thai name, optional legal name, phone, LINE ID, email, address, notes, tags, consent/privacy fields.
- Donor list with search/filter by name, phone, tag, donation history.
- Donor detail page with profile and donation timeline.
- Validation for duplicate phone/email where useful.
- Permission checks for read/write.

Acceptance criteria:
- Staff can create, edit, search, and view donors.
- Invalid input is rejected.
- Donor detail shows donation history once donations exist.
- Tests/build pass.
```

## Prompt 6 — Donation intake

```text
Implement the missing function: Donation intake

Context:
Receiving donations is a core workflow for Thai temples.

Goal:
Add an end-to-end donation recording workflow.

Requirements:
- Create donation with donor optional/required depending on anonymous mode.
- Support payment methods: cash, bank_transfer, qr_payment, other.
- Support donation categories/campaigns.
- Attach slip/evidence file if available.
- Validate amount > 0, date, category, payment method.
- Generate or link receipt/anumodana record when requested.
- Add permission checks and audit logs.

Acceptance criteria:
- Finance user can record a donation.
- Anonymous donation is supported if product rules allow.
- Donation appears in donor history and dashboard totals.
- Invalid amount/category/payment method is rejected.
- Audit log is created.
```

## Prompt 7 — Receipt / anumodana document numbering

```text
Implement the missing function: Receipt and anumodana document numbering

Context:
Temple donations need traceable receipt/anumodana certificate numbers.

Goal:
Add unique document number generation and receipt/anumodana management.

Requirements:
- Generate unique sequential document numbers with year/month prefix configurable by temple.
- Prevent duplicates at database level.
- Support receipt statuses: draft, issued, voided.
- Void requires reason and creates audit log.
- Add printable/PDF-friendly view with temple profile header.

Acceptance criteria:
- Issuing a receipt creates a unique number.
- Concurrent/duplicate issuance cannot create duplicate numbers.
- Voiding requires permission and reason.
- Voided receipts remain visible but marked voided.
```

## Prompt 8 — Accounting ledger

```text
Implement the missing function: Accounting income/expense ledger

Context:
Temple finance needs income/expense tracking linked to donations and manual expenses.

Goal:
Add ledger entries for income and expenses.

Requirements:
- Add ledger accounts/categories.
- Income entries can link to donations/receipts.
- Expense entries support category, amount, date, payee/vendor, notes, attachments.
- No hard delete for ledger entries; use void/cancel with reason.
- Add monthly summary and export-ready data table.
- Add permission checks and audit logs.

Acceptance criteria:
- Finance user can record income/expense.
- Donation creates or links to income ledger entry.
- Monthly summary totals are correct.
- Voiding entries creates audit log and preserves history.
```

## Prompt 9 — Temple profile/master data

```text
Implement the missing function: Temple profile and master data

Context:
Temple identity is used across dashboard, reports, receipts, and public views.

Goal:
Add temple profile settings.

Requirements:
- Store temple name, address, phone, email, website, map/location, abbot name, logo, document header/footer text.
- Only admin can edit.
- Use temple profile in receipt/anumodana printable view.
- Add validation and audit logs for changes.

Acceptance criteria:
- Admin can edit temple profile.
- Receipt/report views use updated temple profile.
- Non-admin cannot edit settings.
- Audit log records changes.
```

## Prompt 10 — Dashboard MVP

```text
Implement the missing function: Dashboard MVP

Context:
Temple admin and finance users need quick operational overview.

Goal:
Add role-aware dashboard for core metrics and pending work.

Requirements:
- Show today's donations, month-to-date donations, month-to-date expenses, net balance.
- Show recent donations and recent ledger entries.
- Show pending receipts/void requests if applicable.
- Show upcoming events/ceremonies placeholders if those modules are not implemented yet.
- Dashboard content respects user permissions.

Acceptance criteria:
- Finance/admin sees financial totals.
- Non-finance role does not see restricted finance metrics.
- Empty state is helpful when no data exists.
- Metrics match underlying records.
```
