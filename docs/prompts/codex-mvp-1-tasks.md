# Codex MVP-1 Tasks — Finance-First (temple)

> Codex-ready prompts หนึ่งงานต่อหนึ่ง slice ตาม [`../plans/mvp-1-build-plan.md`](../plans/mvp-1-build-plan.md) + [`../architecture/mvp-1-domain-model.md`](../architecture/mvp-1-domain-model.md)
> **Task 1 = scaffold เท่านั้น** • ทำเรียงทีละ task • 1 task = 1 branch/worktree • ห้ามปิดงานโดยไม่มี command output จริง

## กฎร่วมทุก task (ใส่ในทุก prompt)

- Stack: TypeScript • NestJS (`apps/api`) • Prisma • PostgreSQL **RLS** • React+Tailwind (`apps/web`) • pnpm monorepo
- Multi-tenant: shared DB + `tenant_id` + RLS; ทุก query บน tenant table อยู่ใน `withTenant()` (`set_config('app.tenant_id',$id,true)` ใน transaction); `tenant_id` จาก JWT เท่านั้น
- **ห้าม hard delete การเงิน** (void/cancel + reason); **ทุก financial mutation มี audit** ผูก tenant+actor+timestamp, `after`=แถวหลังเปลี่ยน; reason ขาดตอน void/cancel/reissue → **422**
- Error model: 401/403/404(ข้ามวัด)/409(เลขซ้ำ/concurrency/ใบ active ซ้ำ)/422
- Thai-first; ห้ามขยายไป public portal/booking/calendar/notifications (MVP-2)
- ทำเฉพาะ scope ของ task; แตะ shared path (`apps/api/src/common/**`, `packages/shared/**`, root config, `.github/**`, `infra/**`) ต้องขอ orchestrator ก่อน
- Output ทุก task: changed files + command output summary (จาก run จริง) + unresolved issues

---

## Task 1 — Project scaffold (scaffold only)

```text
Context: empty repo ของระบบจัดการวัด (Thai temple, finance-first MVP-1). ยังไม่มีโค้ด.
Goal: สร้าง pnpm monorepo scaffold ที่รันได้ + CI เขียว — ห้ามใส่ business logic ใด ๆ.
Requirements:
- pnpm workspace + Turborepo: root package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, eslint.config.js
- apps/api (NestJS): main.ts, app.module.ts, config/ (env validation), health/ (GET /health → 200)
- apps/web (React+Vite+Tailwind): app shell + 1 หน้าว่าง
- packages/db, packages/shared, packages/config (โครงว่าง + package.json)
- infra/docker/docker-compose.dev.yml (postgres + redis)
- README.md (setup/dev/test/build) + .env.example (ไม่มี secret จริง)
- .github/workflows/ci.yml (install, typecheck, lint, test, build)
Files to create: ตามรายการข้างบน (ทั้งหมดเป็นไฟล์ใหม่)
Tests/verify (รันจริง แนบ output):
- pnpm install ; pnpm -w typecheck ; pnpm -w lint ; pnpm -w test ; pnpm -w build
- docker compose -f infra/docker/docker-compose.dev.yml up -d db ; curl GET /health → 200
Acceptance criteria:
- ติดตั้งและรันได้ตาม README; global commands ผ่าน; /health 200; ไม่มี secret จริง commit; ยังไม่มี business logic
```

---

## Task 2 — DB schema foundation + RLS + tenant context + seed

```text
Context: scaffold พร้อมแล้ว. ต้องวางรากฐานข้อมูลการเงิน + tenant isolation.
Goal: Prisma schema สำหรับ core finance tables + RLS + withTenant() + seed.
Requirements:
- Prisma models ตาม mvp-1-domain-model.md: temples, platform_users, temple_applications, platform_audit_logs (platform, ไม่มี tenant_id) ; users, donors, donations, receipts, ledger_accounts, ledger_entries, reconciliation_periods, doc_counters, attachments, audit_logs (tenant, มี tenant_id)
- ทุก tenant table: ENABLE + FORCE RLS, policy SELECT(USING)/INSERT(WITH CHECK)/UPDATE(USING+WITH CHECK) ใช้ current_tenant_id() helper = NULLIF(current_setting('app.tenant_id',true),'')::uuid
- DB roles: wat_app (NOBYPASSRLS, runtime, ไม่ใช่ migration role), wat_migrate (DDL). REVOKE DELETE บน donations/receipts/ledger_entries/doc_counters; REVOKE UPDATE+DELETE บน audit_logs
- packages/db/src: tenant-context.ts (withTenant), prisma.ts (wat_app), rls-check.ts
- seed.ts: 2 tenants + users 3 role + ledger_accounts ตัวอย่าง
Files: packages/db/prisma/{schema.prisma,migrations,seed.ts}, packages/db/src/{tenant-context,prisma,rls-check}.ts, packages/db/tests/{rls-isolation,no-hard-delete,document-number-concurrency}.spec.ts, infra/postgres/init/*
Tests/verify:
- pnpm --filter @wat/db prisma migrate dev ; seed ; rls:check
- test:isolation (อ่าน/เขียนข้ามวัดไม่ได้; ลืม context=0 แถว); no-hard-delete (DELETE การเงิน error)
Acceptance criteria:
- migrate จาก DB เปล่าได้; RLS เปิดครบทุก tenant table; cross-tenant อ่าน/เขียนไม่ได้; DELETE การเงินถูกปฏิเสธ
```

---

## Task 3 — Auth + RBAC + audit foundation

```text
Context: schema+RLS พร้อม. ต้องมี auth/role/audit ก่อนทำ finance.
Goal: login email/password + JWT + guards + audit interceptor.
Requirements:
- POST /auth/login (argon2, JWT access+refresh), /auth/logout, refresh rotation
- guards: AuthGuard, RolesGuard (@Roles), tenant guard (ตั้ง withTenant จาก JWT)
- common/filters: error model 401/403/404/409/422
- common/decorators: @CurrentUser, @CurrentTenant, @Roles
- audit module + interceptor: เขียน audit_logs (actor, action, entity, before/after, ip, ts) อัตโนมัติบน mutation
Files: apps/api/src/auth/**, apps/api/src/common/{guards,interceptors,filters,decorators}/** (shared — orchestrator approve), apps/api/src/audit/**, apps/web/src/lib/auth-client.ts
Tests/verify: global ; API: 401 ไม่มี token, 403 role ไม่พอ, login ออก token ; audit test: mutation สร้าง audit row
Acceptance criteria: unauthorized ถูกบล็อก; permission test ผ่าน; audit log เขียนจริง; login/logout/refresh ทำงาน
```

---

## Task 4 — Donor registry

```text
Context: auth พร้อม. ทำ donor ก่อน donation.
Goal: CRUD + ค้นหา/กรอง donor + audit.
Requirements: CRUD donors (name, legal_name?, phone?, line_id?, email?, address?, tags[], notes?, consent?); list search/filter (name/phone/tag); validation Zod (packages/shared); permission (admin/finance/staff เขียน, auditor/viewer อ่าน); audit donor:create/update
Files: apps/api/src/donors/**, apps/web/src/features/donors/**, packages/shared/src/schemas/donor.ts (shared — approve)
Tests/verify: global ; API: create/search, validation 422 ; isolation (donor ข้ามวัดไม่เห็น) ; audit เมื่อแก้ไข
Acceptance criteria: staff สร้าง/แก้/ค้นหา/ดู donor ได้; input ผิดถูก reject; isolation ผ่าน; audit ครบ
```

---

## Task 5 — Donation create/edit/void + auto-post income ledger

```text
Context: donor พร้อม. core workflow.
Goal: บันทึก/แก้/void บริจาค โดย post income ledger atomic.
Requirements:
- create donation (donor_id optional ถ้า anonymous allowed; amount>0; method cash/bank_transfer/qr/other; fund/category; donated_at) → สร้าง income ledger_entry ใน transaction เดียว (atomic)
- void donation (reason บังคับ → 422 ถ้าขาด): ถ้ามี active receipt ให้ void receipt + reverse/cancel ledger + void donation ใน transaction เดียว; audit แยก receipt:void + ledger:cancel + donation:void
- ห้าม hard delete; status recorded|voided
Files: apps/api/src/donations/**, apps/api/src/ledger/** (post income — บางส่วน), apps/web/src/features/donations/**, packages/shared/src/schemas/donation.ts
Tests/verify: global ; test:finance (atomic post; void reverse ทุก entity; audit after=row; reason ขาด→422) ; isolation
Acceptance criteria: finance บันทึกบริจาคได้; ปรากฏใน donor history + dashboard total; void reverse ถูกต้องและ audit ครบ; ไม่มี hard delete
```

---

## Task 6 — Receipt / ใบอนุโมทนา (issue/preview/void/reissue + numbering + PDF)

```text
Context: donation พร้อม. ออกใบอนุโมทนา.
Goal: ออก/preview/void/reissue ใบ เลขที่ unique ต่อวัด.
Requirements:
- issue: เลข doc_no unique (tenant_id, doc_no) ผ่าน doc_counters (UPDATE...RETURNING/advisory lock ใน transaction) กัน concurrency; status issued; ผูก donation
- preview/PDF view มีหัวเอกสารวัด; bahtText (จำนวนเงินเป็นตัวอักษรไทย)
- void (reason→422 ถ้าขาด): status voided, เลขไม่ reuse
- reissue: ใบเดิม superseded + superseded_by, ใบใหม่เลขใหม่ผูก donation เดิม; audit receipt:issue/reissue/void
- 1 donation มีใบ active ครั้งละ 1 (ออกซ้ำขณะมี active → 409)
Files: apps/api/src/receipts/**, doc-number logic (packages/db หรือ receipts), apps/web/src/features/receipts/**, util bahtText
Tests/verify: global ; test:doc-number-concurrency (ออกพร้อมกันไม่ซ้ำ) ; test:finance (void/reissue + audit after=row) ; preview render
Acceptance criteria: ออกใบได้เลข unique; concurrent ไม่ซ้ำ; void ต้องสิทธิ์+reason และยังเห็นแบบ voided; reissue เลขใหม่ ใบเก่า superseded
```

---

## Task 7 — Ledger income/expense entries

```text
Context: รายรับจากบริจาคมีแล้ว. เพิ่มรายจ่าย + สมุดบัญชี.
Goal: ledger entries income/expense + void/cancel + monthly summary.
Requirements: expense entry (account_id, amount, entry_date, payee?, note?, attachment?); income link donation; ledger_accounts (chart); doc_no unique ต่อวัด; void/cancel (reason→422), no hard delete; monthly summary (รับ/จ่าย/คงเหลือ) นับเฉพาะ recorded ไม่ใช่ cancelled; audit ledger:create/cancel
Files: apps/api/src/ledger/**, apps/web/src/features/ledger/**, packages/shared/src/schemas/ledger.ts
Tests/verify: global ; test:finance (no-hard-delete; cancel audit; summary ไม่นับ cancelled) ; isolation
Acceptance criteria: finance บันทึกรับ/จ่ายได้; donation link income entry; summary ถูกต้อง; void เก็บประวัติ + audit
```

---

## Task 8 — Reconciliation / close period

```text
Context: ledger พร้อม. ปิดงวด.
Goal: reconcile รายการ + ปิดงวด + lock.
Requirements: reconciliation_periods (period, status open|closed); mark entry reconciled; close period (closed_by/at); หลังปิด ห้ามแก้/void รายการในงวด (409/403); audit ledger:reconcile, period:close
Files: apps/api/src/ledger/** (reconcile/period), apps/web/src/features/ledger/**
Tests/verify: global ; API: close period → แก้รายการในงวดไม่ได้ ; audit
Acceptance criteria: ปิดงวดได้; รายการในงวดที่ปิดแก้ไม่ได้; audit period:close/reconcile ครบ
```

---

## Task 9 — Finance dashboard

```text
Context: finance data พร้อม. ทำ dashboard.
Goal: dashboard role-aware.
Requirements: การ์ด รับเดือนนี้/จ่ายเดือนนี้/คงเหลือ/ผู้บริจาคใหม่; รายการล่าสุด; คิว รอออกใบ/รอกระทบยอด; respects permission (role ไม่พอไม่เห็นเมตริกการเงิน); empty state ไทย
Files: apps/api/src/dashboard/** (หรือ aggregate ในโมดูลเดิม), apps/web/src/features/dashboard/**
Tests/verify: global ; API: ตัวเลขตรงกับ ledger ; role ต่ำไม่เห็นเมตริกการเงิน
Acceptance criteria: finance/admin เห็นยอด; non-finance ไม่เห็น restricted; empty state ช่วยเหลือ; เลขตรง record
```

---

## Task 10 — Reports / export

```text
Context: dashboard พร้อม. ทำรายงาน/ส่งออก.
Goal: รายงานบริจาค/ใบอนุโมทนา/ledger + export CSV/PDF.
Requirements: report endpoints (filter ช่วงวันที่/กองทุน/สถานะ; pagination/sort สำหรับ list); export CSV/PDF (Excel ถ้าได้); audit report:export; isolation (เฉพาะวัดตน)
Files: apps/api/src/reports/**, apps/web/src/features/reports/**
Tests/verify: global ; API: export ข้อมูลตรง + audit ; isolation
Acceptance criteria: export ได้ครบ 3 รายงาน; ตัวเลขตรง; audit export; ไม่หลุดข้ามวัด
```

---

## Task 11 — Minimal Innovera platform admin

```text
Context: tenant finance พร้อม. เพิ่ม platform plane ขั้นต่ำ.
Goal: จัดการ tenant/application/user ระดับแพลตฟอร์ม.
Requirements:
- applications: list, approve → สร้าง temple(active), reject(reason); temples: suspend/resume(reason); platform_users: disable/enable; users ข้ามวัด: list/filter scope
- platform role super_admin/support แยกจาก tenant role; platform plane ไม่ตั้ง tenant context และ **ไม่อ่านข้อมูลการเงินของวัด** โดย default
- break-glass (support เข้าข้อมูล tenant): reason + expiry + audit + read-only; บันทึก platform_audit_logs
Files: apps/api/src/platform/**, apps/web (console minimal/route แยก)
Tests/verify: global ; API: platform role แยก tenant; ห้ามอ่าน finance วัด (เว้น break-glass); platform action → platform audit
Acceptance criteria: approve/reject/suspend/resume/disable/enable ทำงาน + audit; ไม่มี cross-tenant data leak; break-glass บังคับ reason/expiry/audit/read-only
```

---

## ลำดับรัน 3 task แรก

1. **Task 1 — scaffold only** (ไม่มี business logic)
2. **Task 2 — DB schema + RLS + tenant context + seed**
3. **Task 3 — Auth + RBAC + audit foundation**

> หลังแต่ละ task: reviewer (finance/security/ux) read-only + Antigravity sanity + orchestrator verify command output จริงก่อนปิด gate และ merge
