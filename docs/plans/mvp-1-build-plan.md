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
| 5 | Receipt / ใบอนุโมทนา | ⬜ ถัดไป |
| 6 | Ledger income/expense | ⬜ |
| 7 | Reconciliation / close period | ⬜ |
| 8 | Finance dashboard | ⬜ |
| 9 | Reports / export | ⬜ |
| 10 | Platform admin | ⬜ |

> Phase 0–3 อยู่ใน commit `af7afff` (MVP-1 foundation). Phase 4 (Task 5): atomic income posting + void reverse (receipt→ledger→donation) + composite tenant FK; ผ่าน api 32 + web 27 tests, `migrate reset`/seed/`rls:check`, และ global typecheck/lint/build ครบ

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

### Phase 5 — Receipt / ใบอนุโมทนา (issue/preview/void/reissue + numbering + PDF)

- **ส่งมอบ:** ออกใบ เลขที่ unique ต่อวัด (กัน concurrency), preview/PDF, void(reason), reissue(เลขใหม่ ใบเก่า superseded), `bahtText` แปลงจำนวนเป็นตัวอักษร
- **Files/modules:** `apps/api/src/receipts/**`, `doc_counters` logic (ใน `packages/db` หรือ receipts service), `apps/web/src/features/receipts/**`, PDF util
- **Verify:** global • `test:doc-number-concurrency` (ออกพร้อมกันไม่ซ้ำ) • test:finance (void/reissue + audit `receipt:void`/`receipt:reissue`, after=row) • preview render

### Phase 6 — Ledger income/expense entries

- **ส่งมอบ:** บันทึกรายจ่ายมือ (หมวด/จำนวน/วันที่/payee/แนบหลักฐาน), void/cancel(reason), monthly summary, ตารางพร้อม export
- **Files/modules:** `apps/api/src/ledger/**`, `apps/web/src/features/ledger/**`, `packages/shared/src/schemas/ledger.ts`
- **Verify:** global • test:finance (no-hard-delete, void audit, ยอดสรุปไม่นับ cancelled) • isolation

### Phase 7 — Reconciliation / close period

- **ส่งมอบ:** ทำเครื่องหมายกระทบยอดรายการ, ปิดงวด (`ReconciliationPeriod`), หลังปิดงวดห้ามแก้รายการในงวด (lock)
- **Files/modules:** `apps/api/src/ledger/**` (reconcile/period), `apps/web/src/features/ledger/**`
- **Verify:** global • API test: close period → รายการในงวด edit ไม่ได้ (409/403) • audit `ledger:reconcile` / `period:close`

### Phase 8 — Finance dashboard

- **ส่งมอบ:** การ์ดรับเดือนนี้/จ่ายเดือนนี้/คงเหลือ/ผู้บริจาคใหม่, รายการล่าสุด, คิวงาน (รอออกใบ/รอกระทบยอด), respects permission
- **Files/modules:** `apps/api/src/dashboard/**` (หรือ aggregate ใน existing modules), `apps/web/src/features/dashboard/**`
- **Verify:** global • API test: ตัวเลขตรงกับ ledger • role ไม่พอไม่เห็นเมตริกการเงิน

### Phase 9 — Reports / export

- **ส่งมอบ:** รายงานบริจาค/ใบอนุโมทนา/ledger + export CSV/PDF (Excel ถ้าทำได้)
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

- เลขใบอนุโมทนา: prefix/รีเซ็ตรายปี/เลขไทย? (บล็อก Phase 5) — และ **ต้องยืนยันข้อกำหนดทางกฎหมาย/ภาษีก่อน lock void/reissue**
- chart of funds / หมวดบริจาค-บัญชีตั้งต้น — **Phase 4 ตัดสินแล้ว (Task 5 D2):** post เข้าบัญชี revenue `4000` ตั้งต้น (`fundAccountId` optional, default = 4000, resolve ใน tenant tx + 422 ถ้าไม่ใช่ revenue/inactive/ข้ามวัด); full chart-of-funds UI ยังค้างไว้ Phase 6
- วิธีรับเงิน — **ตัดสินแล้ว (Task 5 D1):** enum `donation_method = cash | bank_transfer | qr | other` (Thai labels ใน `packages/shared`)
- นิยาม "ปิดงวด" + แก้ย้อนหลังได้แค่ไหน (Phase 7)
- หัวเอกสาร/ตราวัดใน PDF (Phase 5)
- ขอบเขต platform admin ใน MVP-1 (Phase 10) เท่าไรถึงพอ
