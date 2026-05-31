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
| 10 | Platform admin | ✅ เสร็จ (Task 11) — MVP-1 ครบ |
| 11 (post-MVP-1) | Temple profile / master data | ✅ เสร็จ (Task 12) |
| 12 (post-MVP-1) | Monk/staff (personnel) management | ✅ เสร็จ (Task 13) |
| 13 (post-MVP-1) | Ceremonies / งานบุญ-พิธี (basic records) | ✅ เสร็จ (Task 14) |
| 14 (post-MVP-1) | Inventory / คลังของบริจาค-พัสดุ (items + movements) | ✅ เสร็จ (Task 15) |
| — (hardening) | Global Prisma-error filter (ปิด @Catch(HttpException)-only gap) | ✅ เสร็จ (Task 16) |
| 15 (post-MVP-1) | In-tenant user management (admin จัดการผู้ใช้+สิทธิ์) | ✅ เสร็จ (Task 17) |
| 16 (post-MVP-1) | Attachments / แนบหลักฐาน (DB-stored, รับ-ดาวน์โหลด-ลบ) | ✅ เสร็จ (Task 18) |

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

> **Phase 10 (Task 11) — Minimal Innovera platform admin** — decisions (MVP-1 ครบ):
> - **Plane แยกจาก tenant อย่างสมบูรณ์:** platform token type แยก (`typ=platform_access`, **ไม่มี tenant_id**, claim `platform_role` super_admin/support) ใช้ HMAC secret เดียวกับ tenant แต่แยกด้วยการ assert `typ` ทั้งสองฝั่ง; `PlatformAuthGuard` ไม่ตั้ง tenant context. ทุก endpoint อ่าน/เขียนผ่าน `withSystemAccess` (wat_migrate, นอก RLS) จึงต้องใส่ `where:{tenantId}` ชัดเจนทุก query ที่แตะ tenant table. platform action audit ลง `platform_audit_logs` (reason/expiry/ip อยู่ใน metadata) ใน tx เดียวกับ mutation
> - **Endpoints:** applications list/approve/reject; temples suspend/resume; platform-users disable/enable; cross-tenant users directory; break-glass. approve/reject/suspend/resume/disable/enable = **super_admin**; list/directory/break-glass = super_admin+support. reject/suspend/resume บังคับ `reason`
> - **D1 approve สร้าง temple(active) + admin user แรก** (รับ adminEmail[+default=contactEmail]/adminPassword) → วัดใช้งานได้ทันที; claim ใบสมัครแบบ conditional updateMany กัน double-approve (loser→409); ทั้ง temple+user+link+audit atomic; P2002 → 409 ไม่ใช่ 500. ผูก `temple_applications.created_temple_id` (FK ON DELETE SET NULL)
> - **D2 break-glass = summary read-only:** grant (reason+ttl≤120m) → snapshot เป็นยอดรวม/นับ + receipt ล่าสุดแบบ metadata (ไม่มี PII), บังคับ owner + ยังไม่หมดอายุ/ไม่ถูก revoke ตอนใช้, ทุก open/access/revoke audit; ไม่มี write path ใด ๆ ผ่าน grant
> - **D3 API-only** (ไม่มี web console — เลื่อนเป็น task แยก)
> - ผ่าน api 108 (platform 16) + web 88 + db 7 + shared 12 tests, clean `migrate reset`+seed+`rls:check`, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings: **directory fail-open** (tenantId malformed→422 + audit ทุก cross-tenant read), **disable = kill-switch ทันที** (guard re-check `isActive`/role จาก DB ต่อ request + revoke refresh tokens), **refresh-reuse → revoke ทั้ง family**, **reject เลิก findUniqueOrThrow** (กัน P2025 500), FK `ON DELETE SET NULL`, seed demo app ไม่ปลุก approved row

> **Post-MVP-1 (Task 12) — Temple profile / master data** — decisions:
> - `GET /temple` (admin/finance/staff) + `PATCH /temple` (admin) แก้ข้อมูลหลักของวัดตน: ที่อยู่ไทย/ติดต่อ/เจ้าอาวาส/เลขทะเบียน-ภาษี/นิกาย/logo/หัว-ท้ายใบอนุโมทนา (16 คอลัมน์ nullable เพิ่มบน `temples`). อ่าน/เขียนผ่าน `withSystemAccess` scoped `id=tenantId` (temples ไม่มี RLS + wat_app ไม่มีสิทธิ์ — เหมือน idiom ที่ receipts ใช้). audit `temple:update` (before/after) ใน tx เดียวกัน
> - **Mass-assignment safe:** validator เป็น partial-patch ที่ whitelist เฉพาะฟิลด์แก้ได้ + **reject** id/slug/status/ฟิลด์แปลกปลอม → 422 (status เป็นของ platform suspend/resume เท่านั้น); nameTh ห้ามเคลียร์; ฟิลด์ optional ส่ง "" = ล้างเป็น null
> - **ต่อยอดของที่ ship แล้ว:** ใบอนุโมทนา (receipt preview) แสดง หัวเอกสาร/ที่อยู่/ท้ายเอกสาร จาก profile (field optional — ไม่กระทบ flow เดิม)
> - web: หน้า `ข้อมูลวัด` (view เป็น section + ฟอร์มแก้เฉพาะ admin, empty state, ส่งเฉพาะ field ที่เปลี่ยนผ่าน diff)
> - ผ่าน api 114 (temple 6) + web 97 + db 7 + shared 12 tests, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings: P2025 จาก update race → `notFound` (กัน raw 500), reject ฟิลด์นอก whitelist เป็น 422 (เดิม drop เงียบ), เพิ่ม test mass-assignment/non-string

> **Post-MVP-1 (Task 13) — Monk/staff (personnel) management** — decisions:
> - ทะเบียน พระ/สามเณร/บุคลากร เป็น **tenant table ปกติ** (`personnel`, tenant_id + RLS enable/force + 4 policies) แก้ผ่าน `withTenant` (wat_app, RLS net จริง) — ต่างจาก temple/platform ที่ใช้ withSystemAccess. `GET/POST/PATCH /personnel(/:id)`; write = admin/staff, read = +finance; audit `personnel:create`/`personnel:update` (before/after) ใน tx เดียวกัน
> - **ไม่มี hard delete** — archive ด้วย `status=inactive` (wat_app ไม่มีสิทธิ์ DELETE; wat_migrate มี TRUNCATE สำหรับ cascade จาก temples). validator partial-patch + reject ฟิลด์นอก whitelist (กัน mass-assignment); date เป็น YYYY-MM-DD (isValidIsoDate) → แปลงเป็น Date ใน service; phansaCount int 0-200; nationalId 13 หลัก; `:id` malformed/ข้ามวัด → 404 (uuid guard + P2025→notFound)
> - web: หน้า `พระ/สามเณร/บุคลากร` (ตาราง + filter ประเภท/สถานะ/ค้นหา + ฟอร์ม add/edit, empty state)
> - ผ่าน api 120 (personnel 6) + web 106 (+9) + db 7 + shared 12 tests, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings (ทั้ง low): create spread `tenantId` ท้ายสุด (context-wins), `phansaCount` กัน loose Number() coercion, **mask nationalId ใน audit snapshot** (เก็บ 4 ตัวท้าย), เพิ่ม test mass-assignment tenant_id/id→422

> **Post-MVP-1 (Task 14) — Ceremonies / งานบุญ-พิธี (basic records)** — decisions:
> - ทะเบียนงานบุญ/พิธี เป็น **tenant table ปกติ** (`ceremonies`, tenant_id + RLS) แก้ผ่าน `withTenant`. `GET/POST/PATCH /ceremonies(/:id)`; write = admin/staff, read = +finance; audit `ceremony:create`/`ceremony:update` (before/after) ใน tx เดียว. filter: ประเภท/สถานะ/ค้นหาชื่อ/ช่วงวันที่ (dateFrom-dateTo)
> - field: ประเภท (ทำบุญ/งานศพ/อุปสมบท/ขึ้นบ้านใหม่/กฐิน-ผ้าป่า/อื่น ๆ), สถานะ (กำหนดการ/เสร็จสิ้น/ยกเลิก), ชื่องาน, วันที่, เวลา, สถานที่/ศาลา, เจ้าภาพ+โทร, พระที่นิมนต์ (free text), จำนวนพระ, หมายเหตุ. **ไม่มี hard delete** — ยกเลิกด้วย status; mass-assignment safe (reject ฟิลด์นอก whitelist); `:id` malformed/ข้ามวัด → 404
> - **ขอบเขต = basic records เท่านั้น** — full booking/ปฏิทิน/จองศาลา/นิมนต์พระ (link personnel) + public calendar **เลื่อน MVP-2** ตาม cowork doc
> - web: หน้า `งานบุญ/พิธี` (ตาราง + filter + ฟอร์ม add/edit + status workflow)
> - ผ่าน api 126 (ceremonies 6) + web 115 (+9) + db 7 + shared 12 tests, global typecheck/lint/build ครบ — รวมแก้ adversarial-review finding (low): เพิ่ม test ตรวจ audit before/after **content + serialization** (ceremonyDate เป็น YYYY-MM-DD, ไม่ leak Date/updatedAt ลง jsonb) ไม่ใช่แค่ row count

> **Post-MVP-1 (Task 15) — Inventory / คลังของบริจาค-พัสดุ-สังฆทาน** — decisions:
> - **2 entity:** `inventory_items` (master + ยอดคงเหลือ denormalized) + `inventory_movements` (รับเข้า/เบิกออก append-only). ทั้งคู่ tenant + RLS, แก้ผ่าน `withTenant`. ยอดเปลี่ยน **ผ่าน movement เท่านั้น** (validator ห้ามตั้ง quantity ตรง). `GET/POST/PATCH /inventory/items(/:id)` + `GET/POST /inventory/items/:id/movements`; write=admin/staff, read=+finance; audit `inventory:item:create/update` + `inventory:movement:create` ใน tx เดียว
> - **Atomic stock + concurrency:** recordMovement ล็อกแถว item ด้วย `SELECT ... FOR UPDATE` (RLS-scoped + tenant_id ในคำสั่ง) → คำนวณ newBalance → เบิกเกิน = 409 → อัปเดต quantity + insert movement(balance_after) + audit ใน tx เดียว. ทดสอบ concurrency: 4 เบิกพร้อมกัน (เกินสต็อก) → สำเร็จ 3 fail 1 ยอดไม่ติดลบ. **ไม่มี hard delete** (archive ด้วย status; movement append-only แก้ด้วยรายการใหม่)
> - DB backstop: CHECK (quantity≥0, balance_after≥0, movement qty>0); cap newBalance ≤ 2e9 กัน int4 overflow→500; `:id` malformed/ข้ามวัด → 404
> - web: หน้า `คลังของบริจาค/พัสดุ` (รายการ+filter + detail ยอดคงเหลือ + ฟอร์มรับเข้า/เบิกออก + ประวัติ)
> - ผ่าน api 135 (inventory 9) + web 123 (+8) + db 7 + shared 12 tests, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings: DB CHECK constraints, int4-overflow cap→409, tenant_id ในคำสั่ง lock/update (defense-in-depth), ใช้ผล update แทน re-read, ordering tiebreaker, movementSnapshot ครบ field
> - **ค้าง (recurring, เลื่อน task เฉพาะ):** `ProjectExceptionFilter` เป็น `@Catch(HttpException)` อย่างเดียว → raw Prisma error (serialization/deadlock/unmapped) หลุดเป็น 500 — ควรทำ global Prisma-error filter ครั้งเดียวทั้งแอป (paths ที่ถึงได้ใน module ปิดด้วย guard/uuid/cap แล้ว)

> **Hardening (Task 16) — Global Prisma-error filter** — decisions:
> - แก้ recurring finding ที่ adversarial review ชี้ทุก task: `ProjectExceptionFilter` เดิม `@Catch(HttpException)` อย่างเดียว → raw Prisma/driver error หลุดเป็น **500 ดิบ (leak stack)**. เปลี่ยนเป็น `@Catch()` catch-all ตัวเดียว (ไม่มีปัญหา ordering): HttpException = logic เดิม (4xx byte-for-byte); Prisma `PrismaClientKnownRequestError` map ตาม code (P2025→404, P2002·P2003→409, P2000→422, อื่น→500); validation/unknown/non-Error → **500 enveloped + log server-side, ไม่ leak ข้อความ/stack ให้ client**
> - **ทุก ≥500 ถูก sanitise** ไม่ว่ามาจาก HttpException หรือไม่ (caller-supplied 500 message ไม่หลุด) + log ทุกตัว; guard `host.getType()!=='http'`
> - เป็น backstop ทั้งแอป — service ที่ catch P2025 เองอยู่แล้ว (temple/personnel/ceremonies/inventory) ยังทำงานเหมือนเดิม
> - ผ่าน api 145 (filter spec 10) + web 123 + db 7 + shared 12 tests, global typecheck/lint/build ครบ — แก้ adversarial-review findings: ≥500 HttpException force generic message + log, non-HTTP-context guard, เพิ่ม test no-leak (string/Prisma/Error)

> **Post-MVP-1 (Task 17) — In-tenant user management** — decisions:
> - `GET/POST/PATCH /users(/:id)` **admin-only ทั้ง controller** (class-level @Roles); withTenant+RLS. ไม่ต้อง migration (ตาราง `users` มีครบ). audit `user:create`/`user:update`. **ไม่คืน passwordHash** (select ตัดทิ้ง, ไม่อยู่ใน snapshot); password hash ผ่าน PasswordService; email **immutable** ตอนแก้
> - **Security invariants:** last-admin protection (advisory lock ต่อ tenant + count active admin อื่น → ปิด/ลดสิทธิ์ admin คนสุดท้าย = 409), self-disable = 403, email ซ้ำ = 409 (pre-check + P2002 backstop), create reject mass-assignment (isActive/tenantId/id → 422), `:id` malformed/ข้ามวัด → 404
> - **AuthGuard เป็น stateful แล้ว (hardening คู่กัน):** re-check `isActive`+role จาก DB ต่อ request (เหมือน platform plane) → disable/demote มีผล **ทันที** ไม่ต้องรอ access token หมดอายุ; disable/เปลี่ยนรหัส revoke refresh tokens ด้วย
> - web: หน้า `ผู้ใช้และสิทธิ์` (รายการ+filter + ฟอร์ม create/edit, email read-only ตอนแก้, toggle เปิด/ปิด)
> - ผ่าน api 154 (users 9) + web 130 (+7) + db 7 + shared 12 tests, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings: role-demotion escalation (→ stateful AuthGuard ปิดทั้ง disable+demote ทันที), create mass-assignment → 422

> **Post-MVP-1 (Task 18) — Attachments / แนบหลักฐาน** — decisions:
> - **เก็บไฟล์ใน DB (bytea)** บน `attachments` (TOAST out-of-line — list metadata ไม่ดึง blob); upload แบบ base64-JSON (main.ts body limit 12MB); `POST /attachments` · `GET ?ownerType&ownerId` (metadata ไม่มี blob) · `GET /:id/download` (StreamableFile) · `DELETE /:id`. admin/finance/staff. audit `attachment:create`/`attachment:delete`. ผูกกับ donation/receipt/ledger_entry/donor (ตรวจ owner มีจริงในวัด → 404)
> - **D1 เลือก DB-bytea** (ไม่ใช่ S3) — self-contained, ไม่ต้อง cloud/creds, durable, RLS คุ้มครอง; เพิ่ม DELETE RLS policy ให้ attachments (foundation มีแต่ grant ไม่มี policy)
> - validation: MIME allowlist (jpeg/png/webp/pdf), cap 5MB (คำนวณจาก base64 ก่อนเก็บ), sanitizeFileName (strip control/separator/quote), per-owner quota ≤20
> - web: `AttachmentsPanel` (upload→base64 + list + download/delete) reusable ต่อ owner
> - ผ่าน api 163 (attachments 9) + web 138 (+8) + db 7 + shared 12 tests, global typecheck/lint/build ครบ — รวมแก้ adversarial-review findings: **ชื่อไฟล์ไทย → Content-Disposition 500** (RFC 5987 `filename*` + ASCII fallback — ระบบ Thai-first!), `nosniff` header, sanitize เพิ่ม DEL/C1/Unicode-sep, reject ชื่อ all-underscore, byteSize→string, per-owner quota
> - **ค้าง (infra hardening task):** rate-limiting (@nestjs/throttler) บน upload + scope body limit เฉพาะ route + per-tenant quota — DoS เป็น authenticated-trusted-role (medium)

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

### Phase 10 — Minimal Innovera platform admin ✅

- **ส่งมอบ:** platform plane ขั้นต่ำ: review/approve/reject `TempleApplication`, จัดการวัด (suspend/resume), จัดการ platform user (disable/enable), directory ผู้ใช้ข้ามวัด, platform audit — **ไม่เข้าถึงข้อมูลการเงิน tenant โดย default** (break-glass read-only เท่านั้น)
- **Files/modules:** `apps/api/src/platform/**`, platform audit (web console เลื่อนเป็น task แยก — API-only)
- **Verify:** global • API test: platform role แยกจาก tenant role (token plane แยกด้วย `typ`), ห้ามอ่านข้อมูลการเงินวัด (เว้น break-glass: reason+expiry+audit+read-only), platform actions → platform audit ✅

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
