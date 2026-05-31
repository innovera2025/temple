# MVP-1 Build Plan — Finance-First (temple)

> แปลงจาก function inventory ([`../reviews/claude-design-function-inventory.md`](../reviews/claude-design-function-inventory.md)) + gap review เป็น backlog ที่ Codex ลงมือทำได้เป็น slice เล็ก ๆ ตรวจสอบได้
> ขอบเขต: **MVP-1 = finance-first** — Claude Design ใช้เป็น "product target" ไม่ใช่ backend architecture
> **ยังไม่ implement โค้ดในเอกสารนี้** — เป็นแผน; การลงมือดู [`../prompts/codex-mvp-1-tasks.md`](../prompts/codex-mvp-1-tasks.md)

## สถานะปัจจุบัน (progress)

| Phase | งาน | สถานะ |
|------|------|-------|
| 0 | Project scaffold | ✅ เสร็จ (Task 1) |
| 1 | DB schema + RLS + tenant context + seed | ✅ เสร็จ (Task 2) |
| 2 | Auth + RBAC + audit | ✅ เสร็จ (Task 3) |
| 3 | Donor registry | ✅ เสร็จ (Task 4) |
| 4 | Donation create/edit/void + auto-post income ledger | ✅ เสร็จ (Task 5) |
| 5 | Receipt / ใบอนุโมทนา (issue/void/reissue/preview + numbering) | ✅ เสร็จ (Task 6) |
| 6 | Ledger income/expense | ✅ เสร็จ (Task 7) |
| 7 | Reconciliation / close period | ✅ เสร็จ (Task 8) |
| 8 | Finance dashboard | ✅ เสร็จ (Task 9) |
| 9 | Reports / export | ✅ เสร็จ (Task 10) |
| 10 | Platform admin | ⬜ ถัดไป |

> Phase 0–3 อยู่ใน commit `af7afff` (MVP-1 foundation). Phase 4 (Task 5): atomic income posting + void reverse (receipt→ledger→donation) + composite tenant FK. Phase 5 (Task 6): receipt issue/void/reissue (supersession) + RCPT numbering (atomic, unique/วัด) + printable preview ผ่าน `bahtText` + Task5↔Task6 void integration; ผ่าน api 46 + web 40 + db 7 tests, `migrate reset`/seed/`rls:check`, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings (reissue↔donation-void lock-ordering race, malformed-:id 500)

> **Phase 6 (Task 7) — Ledger income/expense manual entries + summary** — decisions:
> - **D1 ทิศทาง (direction) มาจากชนิดบัญชี** ไม่เก็บคอลัมน์ direction ซ้ำซ้อน: รายการที่ post เข้าบัญชี `revenue` = รายรับ, `expense` = รายจ่าย. manual entry ต้อง post เข้าบัญชี active ที่เป็น `revenue`/`expense` เท่านั้น (อื่น ๆ → 422). สรุปยอด income/expense/balance นับเฉพาะ `status = posted` (ไม่นับ `voided`).
> - **D2 เลขเอกสารใช้ counter เดียวกับ donation income** (`doc_type = ledger_entry`, prefix `LEDG-`) ผ่าน util `allocateLedgerEntryNo` ที่ใช้ร่วมกันทั้ง donation auto-post และ manual entry → ลำดับเลขเดียว, ไม่ชน `(tenant_id, entry_no)`.
> - **D3 void manual entry เท่านั้นทาง `/ledger/entries/:id/void`** (reason บังคับ → 422, lock-row กัน TOCTOU, no hard delete). รายการที่ผูก donation (`donation_id` ≠ null) **ห้าม void ทางนี้ → 409** ให้ไป void ที่ donation เพื่อรักษา invariant donation↔ledger↔receipt ให้ atomic.
> - **D4 payee** เพิ่มคอลัมน์ `payee` (nullable) บน `ledger_entries` (additive migration, RLS แถวเดิมครอบคลุม, DELETE ยังถูก revoke). **แนบหลักฐาน (attachment) เลื่อน** ไปทำเมื่อมี storage backend (เหมือน binary-PDF) — schema `attachments` พร้อมแล้วแต่ยังไม่มี upload pipeline.
> - **D5 สิทธิ์:** create/void/summary = admin/finance; list/get/accounts = admin/finance/staff. ผ่าน api 18 + web 18 tests, `migrate deploy`/`rls:check`, global typecheck/lint/test/build ครบ

> **Phase 7 (Task 8) — Reconciliation / close period** — decisions:
> - **ปิดงวด** `POST /ledger/periods/close {periodStart,periodEnd}` สร้าง `reconciliation_periods` (closedAt + `closed_by_user_id` composite FK→users), audit `period:close`; ช่วงทับซ้อนงวดที่ปิดแล้ว → 409. **กระทบยอด** `POST /ledger/entries/:id/reconcile` ตั้ง `reconciled_at` (เฉพาะ posted, idempotent → 409 ถ้าทำซ้ำ), audit `ledger:reconcile`.
> - **Lock:** หลังปิดงวด ทุก ledger mutation ที่ entry_date อยู่ในช่วง → 409 ผ่าน `assertDateNotInClosedPeriod` ฝังในทุกจุด **รวม donation-driven** (post/update/void) — recording/แก้/void บริจาคที่แตะงวดที่ปิด = 409
> - **Concurrency:** `pg_advisory_xact_lock` ต่อ tenant ที่ต้นทุก ledger mutation + closePeriod → serialize กัน race (entry แทรกเข้างวดที่เพิ่งปิด / ปิดงวดทับซ้อน/ซ้ำ → 409 ไม่ใช่ 500)
> - ผ่าน api 75 (reconciliation 14) + web 73 + db 7 + shared 6 tests, `migrate deploy`/seed/`rls:check`, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings (close↔mutation race [HIGH], overlapping-close, reconcile idempotency)

> **Phase 8 (Task 9) — Finance dashboard** — decisions:
> - `GET /dashboard` **role-aware**: ยอดเงิน (รับ/จ่าย/คงเหลือเดือนนี้) + รายการบริจาคล่าสุด เห็นเฉพาะ admin/finance (`includeFinancials = role∈{admin,finance}`); staff เห็นแค่ counts/คิว (operational ไม่มีเงิน). ไม่มี migration/lock/audit (read-only)
> - การ์ด: รับ/จ่าย/คงเหลือ (reuse `LedgerEntriesService.summary` → ตรง ledger เป๊ะ), ผู้บริจาคใหม่เดือนนี้; คิว: รอออกใบ (confirmed ไม่มี issued receipt) / รอกระทบยอด (posted, reconciledAt null); recent = 5 ล่าสุด **เฉพาะ confirmed** (ไม่โชว์ที่ยกเลิก); empty state ไทย
> - ผ่าน api 82 (dashboard 7) + web 81 (dashboard 8) + db 7 + shared 6 tests, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings (recent ไม่กรอง cancelled, staff-gating test coverage)

> **Phase 9 (Task 10) — Reports / export** — decisions:
> - `GET /reports/:type` (`donations`|`receipts`|`ledger`) **admin/finance เท่านั้น** (มีเงิน+ข้อมูลผู้บริจาค); type ไม่ถูกต้อง → 422. สร้างรายงานเป็น columns + rows(string[][]) + CSV (RFC-4180, CRLF, escape `",\r\n`) ฝั่ง web ดาวน์โหลดพร้อม UTF-8 BOM ให้ Excel อ่านไทยถูก. ทุกครั้ง audit `report:export` (actor + type + filters + count) ใน tx เดียวกับการอ่าน — อ่านใต้ RLS จึงข้ามวัดไม่ได้
> - **D1 ส่งมอบ CSV (+printable preview ฝั่ง web) ไม่ใช่ binary PDF/Excel** — เลื่อน binary export ไปจนกว่าจะมี lib/ระบบ template (เหมือน binary-PDF ของ Phase 5)
> - **D2 วันที่แบบ ICT (UTC+7):** ตัวกรองวันของ `receipt.issuedAt` (timestamptz) ใช้ช่วงครึ่งเปิด `[dateFrom 00:00 ICT, (dateTo+1) 00:00 ICT)` + แสดงวันที่เป็นวัน ICT ให้ตรงกับช่วงกรอง (คอลัมน์ `@db.Date` donationDate/entryDate ยังเทียบ UTC-midnight ตามชนิด date เดิม)
> - ผ่าน api 92 (reports 10) + web 88 (reports 7) + db 7 + shared 12 tests, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings: **CSV formula-injection** (neutralize free-text ขึ้นต้น `= + - @` ด้วย leading `'` เฉพาะ donor name/note/payee, ไม่แตะ cell ตัวเลข/วันที่), **status ไม่ถูกต้อง → Prisma enum 500** (drop เงียบแบบ parseLedgerQuery ไม่ใช่ throw), **receipts date filter UTC→ICT**, audit เพิ่ม `accountId`/`direction`

## Stack & หลักการบังคับ (ตัดสินแล้ว)

- TypeScript end-to-end • NestJS (api) • Prisma • PostgreSQL **Row-Level Security** • React + Tailwind (web) • pnpm monorepo
- Multi-tenant: **shared DB + `tenant_id` + RLS** (ตั้ง context ผ่าน transaction wrapper + `SELECT set_config('app.tenant_id', $id, true)` / `SET LOCAL`)
- **ห้าม hard delete ข้อมูลการเงิน** — ใช้ void/cancel พร้อม reason
- **ทุก financial mutation ต้องมี audit** ผูก tenant + actor + timestamp + reason (void/cancel/reissue) + before/after (after = แถวหลังเปลี่ยน ไม่ใช่ null)
- เลขเอกสาร **unique ต่อวัด** กัน concurrency ได้
- Thai-first ทุกส่วน
- รายละเอียด domain ดู [`../architecture/mvp-1-domain-model.md`](../architecture/mvp-1-domain-model.md)

## ขอบเขต MVP-1 vs MVP-2

**MVP-1 (ในแผนนี้):** multi-tenant foundation, auth+RBAC+audit, donor, donation (create/edit/void), receipt/ใบอนุโมทนา (issue/preview/void/reissue), ledger income/expense, reconciliation/close period, finance dashboard, reports/export, minimal Innovera platform admin (tenant/user)

**MVP-2 (เลื่อน เว้นแต่จำเป็นต่อ launch):** public ญาติโยม portal, booking services, public activity calendar, public notifications, full ceremony/activity workflow (เกิน record พื้นฐาน), inventory/assets

---

## Phases (ลำดับ, แต่ละ phase ≤ 1 วันของงาน coding)

> verification: **global** = `pnpm -w typecheck && pnpm -w lint && pnpm -w test && pnpm -w build`; **slice-specific** ระบุต่อ phase; ห้ามปิด phase โดยไม่มี command output/CI link จริง

### Phase 0 — Project scaffold (Codex task #1: scaffold only)

- **ส่งมอบ:** monorepo รันได้, health endpoint, CI เขียว — ยังไม่มี business logic
- **Files/modules:** root (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `README.md`, `.env.example`), `apps/api` (NestJS: `main.ts`, `app.module.ts`, `config/`, `health/`), `apps/web` (React+Tailwind shell), `packages/{db,shared,config}` (โครงว่าง), `infra/docker/docker-compose.dev.yml`, `.github/workflows/ci.yml`
- **Verify:** `pnpm install` • global commands • `GET /health` 200 • `docker compose ... up -d db` ขึ้น

### Phase 1 — DB schema foundation + RLS + tenant context + seed

- **ส่งมอบ:** Prisma schema สำหรับ core tables, RLS เปิด+FORCE ทุก tenant table, `withTenant()` wrapper, `rls-check`, seed 2 tenants + users 3 role
- **Files/modules:** `packages/db/prisma/{schema.prisma,migrations,seed.ts}`, `packages/db/src/{tenant-context.ts,rls-check.ts,prisma.ts}`, `packages/db/tests/{rls-isolation,no-hard-delete,document-number-concurrency}.spec.ts`, DB roles `wat_app`(NOBYPASSRLS)/`wat_migrate`, init SQL ใน `infra/postgres/init`
- **Verify:** `pnpm --filter @wat/db prisma migrate dev` • `seed` • `pnpm --filter @wat/db rls:check` • `test:isolation` (อ่าน/เขียนข้ามวัดไม่ได้, ลืม context = 0 แถว) • `no-hard-delete` (DELETE ตารางการเงิน error)

### Phase 2 — Auth + RBAC + audit foundation

- **ส่งมอบ:** login email/password (argon2) + JWT access/refresh, guards `@Roles()` + tenant guard, audit interceptor + `audit_logs` append-only
- **Files/modules:** `apps/api/src/auth/**`, `apps/api/src/common/{guards,interceptors,filters,decorators}/**`, `apps/api/src/audit/**`, `apps/web/src/lib/auth-client.ts`
- **Verify:** global • API test: 401 ไม่มี token, 403 role ไม่พอ, login ออก token • audit test: action สร้าง audit row

### Phase 3 — Donor registry

- **ส่งมอบ:** CRUD + ค้นหา/กรอง donor, audit เมื่อแก้ไข
- **Files/modules:** `apps/api/src/donors/**`, `apps/web/src/features/donors/**`, `packages/shared/src/schemas/donor.ts`
- **Verify:** global • API test: create/search, validation 422, isolation (donor ข้ามวัดไม่เห็น), audit เมื่อแก้ไข

### Phase 4 — Donation create/edit/void (+ auto-post income ledger) ✅

- **ส่งมอบ:** บันทึก/แก้/void บริจาค; บันทึกบริจาค → post income ledger entry **atomic (1 transaction)**; void = void receipt(ถ้ามี)+reverse ledger+void donation ใน transaction เดียว
- **Files/modules:** `apps/api/src/donations/**`, แตะ `apps/api/src/ledger/**` (post income), `apps/web/src/features/donations/**`, `packages/shared/src/schemas/donation.ts`
- **Verify:** global • test:finance (atomic post, void reverse, audit แยก `donation:void`/`ledger:cancel`, reason ขาด → 422) • isolation

### Phase 5 — Receipt / ใบอนุโมทนา (issue/preview/void/reissue + numbering + PDF) ✅

- **ส่งมอบ:** ออกใบ เลขที่ unique ต่อวัด (กัน concurrency), preview/PDF, void(reason), reissue(เลขใหม่ ใบเก่า superseded), `bahtText` แปลงจำนวนเป็นตัวอักษร
- **Files/modules:** `apps/api/src/receipts/**`, `doc_counters` logic (ใน `packages/db` หรือ receipts service), `apps/web/src/features/receipts/**`, PDF util
- **Verify:** global • `test:doc-number-concurrency` (ออกพร้อมกันไม่ซ้ำ) • test:finance (void/reissue + audit `receipt:void`/`receipt:reissue`, after=row) • preview render

### Phase 6 — Ledger income/expense entries

- **ส่งมอบ:** บันทึกรายจ่ายมือ (หมวด/จำนวน/วันที่/payee/แนบหลักฐาน), void/cancel(reason), monthly summary, ตารางพร้อม export
- **Files/modules:** `apps/api/src/ledger/**`, `apps/web/src/features/ledger/**`, `packages/shared/src/schemas/ledger.ts`
- **Verify:** global • test:finance (no-hard-delete, void audit, ยอดสรุปไม่นับ cancelled) • isolation

### Phase 7 — Reconciliation / close period ✅

- **ส่งมอบ:** ทำเครื่องหมายกระทบยอดรายการ, ปิดงวด (`ReconciliationPeriod`), หลังปิดงวดห้ามแก้รายการในงวด (lock)
- **Files/modules:** `apps/api/src/ledger/**` (reconcile/period), `apps/web/src/features/ledger/**`
- **Verify:** global • API test: close period → รายการในงวด edit ไม่ได้ (409/403) • audit `ledger:reconcile` / `period:close`

### Phase 8 — Finance dashboard ✅

- **ส่งมอบ:** การ์ดรับเดือนนี้/จ่ายเดือนนี้/คงเหลือ/ผู้บริจาคใหม่, รายการล่าสุด, คิวงาน (รอออกใบ/รอกระทบยอด), respects permission
- **Files/modules:** `apps/api/src/dashboard/**` (หรือ aggregate ใน existing modules), `apps/web/src/features/dashboard/**`
- **Verify:** global • API test: ตัวเลขตรงกับ ledger • role ไม่พอไม่เห็นเมตริกการเงิน

### Phase 9 — Reports / export ✅

- **ส่งมอบ:** รายงานบริจาค/ใบอนุโมทนา/ledger + export CSV (printable preview; binary PDF/Excel เลื่อน)
- **Files/modules:** `apps/api/src/reports/**`, `apps/web/src/features/reports/**`
- **Verify:** global • API test: export มีข้อมูลตรง, audit `*:export` • isolation (export เฉพาะวัดตน)

### Phase 10 — Minimal Innovera platform admin

- **ส่งมอบ:** platform plane ขั้นต่ำ: review/approve/reject `TempleApplication`, จัดการวัด (suspend/resume), จัดการผู้ใช้ข้ามวัด (disable/enable), platform audit — **ไม่เข้าถึงข้อมูลการเงิน tenant โดย default** (break-glass เท่านั้น)
- **Files/modules:** `apps/api/src/platform/**`, `apps/web` (console minimal หรือ route แยก), platform audit
- **Verify:** global • API test: platform role แยกจาก tenant role, ห้ามอ่านข้อมูลการเงินวัด (เว้น break-glass: reason+expiry+audit+read-only), platform actions → platform audit

---

## ลำดับ Codex (ดู prompts เต็มใน codex-mvp-1-tasks.md)

Phase 0 → 1 → 2 เป็นรากฐาน (ทำเรียง ห้ามข้าม) จากนั้น 3 → 4 → 5 เป็น flow บริจาค→ใบอนุโมทนา, 6 → 7 ledger/ปิดงวด, 8 → 9 dashboard/report, 10 platform admin
1 feature/slice = 1 branch/worktree, implementer = Codex เท่านั้น, reviewer read-only, merge ผ่าน orchestrator

## Open decisions (บล็อกบาง phase)

- เลขใบอนุโมทนา: prefix/รีเซ็ตรายปี/เลขไทย? — **Phase 5 ใช้ default (Task 6):** prefix `RCPT-` + เลขรันนิ่ง 6 หลัก เลขอารบิก unique/วัด (`doc_counters`), **ไม่รีเซ็ตรายปี**, เลขไม่ reuse หลัง void/supersede. ยังเปิดให้ปรับ (prefix/รีเซ็ตรายปี/เลขไทย) ถ้าวัดต้องการ — และ **ยังต้องยืนยันข้อกำหนดทางกฎหมาย/ภาษี** ก่อน lock void/reissue
- PDF ใบอนุโมทนา: Task 6 ส่ง **printable preview (HTML)** สำหรับ print-to-PDF จากเบราว์เซอร์ (มี `bahtText`); binary PDF (pdfkit/หัวเอกสาร+ตราวัด) เลื่อนไปทำเมื่อยืนยันรูปแบบเอกสาร
- chart of funds / หมวดบริจาค-บัญชีตั้งต้น — **Phase 4 ตัดสินแล้ว (Task 5 D2):** post เข้าบัญชี revenue `4000` ตั้งต้น (`fundAccountId` optional, default = 4000, resolve ใน tenant tx + 422 ถ้าไม่ใช่ revenue/inactive/ข้ามวัด); full chart-of-funds UI ยังค้างไว้ Phase 6
- วิธีรับเงิน — **ตัดสินแล้ว (Task 5 D1):** enum `donation_method = cash | bank_transfer | qr | other` (Thai labels ใน `packages/shared`)
- นิยาม "ปิดงวด" + แก้ย้อนหลังได้แค่ไหน (Phase 7)
- หัวเอกสาร/ตราวัดใน PDF (Phase 5)
- ขอบเขต platform admin ใน MVP-1 (Phase 10) เท่าไรถึงพอ
