# MVP-1 Domain Model — Finance-First (temple)

> โมเดลข้อมูลสำหรับ MVP-1 finance-first แปลงจาก function inventory (candidate data model) ให้พร้อม implement บน Prisma + PostgreSQL RLS
> ขอบเขต: เฉพาะ entity ที่จำเป็นต่อ finance-first; booking/activity/inventory/public = MVP-2 (ระบุท้ายเอกสาร)
> หลักการ: shared DB + `tenant_id` + RLS • ห้าม hard delete การเงิน • ทุก financial mutation มี audit

---

## 1. Tenancy boundaries

| ระดับ | ตาราง | tenant_id? | RLS | เข้าถึงโดย |
|---|---|---|---|---|
| **Platform** | `temples`(tenant registry), `platform_users`, `temple_applications`, `platform_audit_logs` | ✗ (ไม่ผูก tenant) | ไม่ใช้ tenant RLS; คุมด้วย platform role | Innovera super-admin / support |
| **Tenant** | `users`, `donors`, `donations`, `receipts`, `ledger_accounts`, `ledger_entries`, `reconciliation_periods`, `doc_counters`, `attachments`, `audit_logs` | ✓ `tenant_id uuid not null` | **ENABLE + FORCE RLS** (USING + WITH CHECK) | role ภายในวัดของ tenant นั้น |

กฎ tenant context: ทุก query/mutation บน tenant table ต้องอยู่ใน `withTenant(tenantId, …)` ที่ `SELECT set_config('app.tenant_id', $id, true)` ภายใน transaction; `tenant_id` มาจาก JWT ที่ verify แล้วเท่านั้น; platform plane ใช้ connection/scope แยกไม่ตั้ง tenant context (ยกเว้น break-glass)

---

## 2. Entities (MVP-1)

> ทุกตารางมี `id (uuid)`, `created_at`, `updated_at`; tenant table มี `tenant_id`. ฟิลด์ enum ใช้ string union ใน Zod (`packages/shared`)

### Platform plane

**temples** (tenant registry)
- `name`, `province`, `contact`, `phone`, `status` [`active|suspended|pending`], `member_count`, `suspended_reason?`

**temple_applications**
- `temple_name`, `province`, `contact`, `phone`, `applied_at`, `status` [`pending|approved|rejected`], `reviewed_by?`, `review_reason?`

**platform_users**
- `name`, `email` (unique), `role` [`super_admin|support`], `status` [`active|disabled`], `last_login_at?`

**platform_audit_logs** (append-only)
- `actor` (platform_user), `action`, `target_type`, `target_id`, `reason?`, `metadata jsonb`, `ts`

### Tenant plane

**users**
- `tenant_id`, `name`, `email` (unique ต่อ tenant), `password_hash`, `role` [`admin|finance|staff|auditor|viewer`], `status` [`active|disabled`], `last_login_at?`

**donors**
- `tenant_id`, `name`, `legal_name?`, `phone?`, `line_id?`, `email?`, `address?`, `tags string[]`, `notes?`, `consent?`

**donations**
- `tenant_id`, `donor_id?` (null = anonymous ถ้า rule อนุญาต), `amount`, `method` [`cash|bank_transfer|qr|other`], `fund/category`, `donated_at`, `status` [`recorded|voided`], `receipt_id?`, `created_by`, `voided_at?`, `voided_by?`, `void_reason?`

**receipts** (ใบอนุโมทนา)
- `tenant_id`, `doc_no` (unique `(tenant_id, doc_no)`), `donation_id`, `issued_at`, `status` [`issued|superseded|voided`], `superseded_by?`, `voided_at?`, `voided_by?`, `void_reason?`, `pdf_url?`

**ledger_accounts** (chart of accounts/funds)
- `tenant_id`, `name`, `kind` [`income|expense`], `active`

**ledger_entries**
- `tenant_id`, `doc_no` (unique `(tenant_id, doc_no)`), `type` [`in|out`], `account_id`, `amount`, `entry_date`, `ref_doc?`, `donation_id?` (income จากบริจาค), `payee?`, `note?`, `status` [`recorded|cancelled`], `recon_status` [`pending|reconciled`], `period_id?`, `cancelled_reason?`

**reconciliation_periods**
- `tenant_id`, `period` (เช่น `2569-06`), `status` [`open|closed`], `closed_by?`, `closed_at?`

**doc_counters** (ออกเลขเอกสารกัน concurrency)
- `tenant_id`, `doc_type` [`receipt|ledger`], `period`, `last_no` — `UPDATE ... RETURNING` ใน transaction / advisory lock

**attachments**
- `tenant_id`, `entity_type`, `entity_id`, `file_url`, `uploaded_by`

**audit_logs** (append-only; REVOKE UPDATE/DELETE)
- `tenant_id`, `actor` (user), `action`, `entity_type`, `entity_id`, `before jsonb?`, `after jsonb` (แถวหลังเปลี่ยน), `reason?`, `ip?`, `ts`

---

## 3. Relationships

```
temples 1───* users
temples 1───* (ทุก tenant table ผ่าน tenant_id)
donors 1───* donations
donations 1───0..1 receipts        (1 บริจาคมีใบ active ได้ครั้งละ 1)
donations 1───0..1 ledger_entries  (income entry จากบริจาค)
ledger_accounts 1───* ledger_entries
reconciliation_periods 1───* ledger_entries
receipts *───1 doc_counters(receipt) ; ledger_entries *───1 doc_counters(ledger)
ทุก financial mutation ───* audit_logs
platform: temple_applications ──(approve)──> temples ; platform_users ──> platform_audit_logs
```

---

## 4. Role / permission matrix (MVP-1)

✓ = ทำได้ • R = อ่านอย่างเดียว • ✗ = ไม่ได้ • — = ไม่เกี่ยว (คนละ plane)

| Action | admin | finance | staff | auditor | viewer | platform super-admin | platform support |
|---|---|---|---|---|---|---|---|
| ดู dashboard การเงิน | ✓ | ✓ | R(จำกัด) | R | R(จำกัด) | — | — |
| donor CRUD | ✓ | ✓ | ✓ | R | R | — | — |
| donation create/edit | ✓ | ✓ | ✗ | ✗ | ✗ | — | — |
| donation void (reason) | ✓ | ✓ | ✗ | ✗ | ✗ | — | — |
| receipt issue/reissue/void (reason) | ✓ | ✓ | ✗ | ✗ | ✗ | — | — |
| ledger entry create/edit | ✓ | ✓ | ✗ | ✗ | ✗ | — | — |
| ledger void/cancel (reason) | ✓ | ✓ | ✗ | ✗ | ✗ | — | — |
| reconcile / close period | ✓ | ✓ | ✗ | ✗ | ✗ | — | — |
| reports/export | ✓ | ✓ | R | R | ✗ | — | — |
| manage users (ใน tenant) | ✓ | ✗ | ✗ | ✗ | ✗ | — | — |
| temple profile/master data | ✓ | ✗ | ✗ | ✗ | ✗ | — | — |
| อ่าน audit log | ✓ | R | ✗ | R | ✗ | — | — |
| approve/reject application | — | — | — | — | — | ✓ | ✗ |
| suspend/resume temple | — | — | — | — | — | ✓ | ✗ |
| manage users ข้าม tenant | — | — | — | — | — | ✓ | R |
| platform audit | — | — | — | — | — | ✓ | R |

**Break-glass (platform support เข้าข้อมูล tenant):** reason required + expiry required + audit required + read-only default — ค่าเริ่มต้น platform plane **ไม่เห็นข้อมูลการเงินของวัด**

---

## 5. Audit events catalog (MVP-1)

ทุก event เขียนใน transaction เดียวกับ mutation; `after` = แถวหลังเปลี่ยน (ไม่ใช่ null); reason บังคับสำหรับ void/cancel/reissue (ขาด → 422)

| entity | actions |
|---|---|
| auth | `auth:login`, `auth:logout` |
| donor | `donor:create`, `donor:update` |
| donation | `donation:create`, `donation:update`, `donation:void` |
| receipt | `receipt:issue`, `receipt:reissue`, `receipt:void` |
| ledger | `ledger:create`, `ledger:cancel`, `ledger:reconcile` |
| period | `period:close` |
| report | `report:export` |
| user (tenant) | `user:create`, `user:update`, `user:role_change`, `user:disable/enable` |
| temple profile | `temple:update` |
| platform | `application:approve/reject`, `temple:suspend/resume`, `platform_user:disable/enable`, `breakglass:open/close` (platform_audit_logs) |

> void donation ที่มี active receipt = เขียน audit แยกทุก entity ใน transaction เดียว: `receipt:void` + `ledger:cancel` + `donation:void`

---

## 6. ฟิลด์/constraint ที่บังคับ

- unique: `users(tenant_id, email)`, `receipts(tenant_id, doc_no)`, `ledger_entries(tenant_id, doc_no)`, `platform_users(email)`
- index: `(tenant_id, …)` ทุก tenant table; `donations(tenant_id, donor_id)`, `ledger_entries(tenant_id, entry_date)`
- no-hard-delete (REVOKE DELETE + อาจมี trigger): `donations`, `receipts`, `ledger_entries`, `doc_counters`, `audit_logs`(REVOKE UPDATE/DELETE ด้วย)
- DB roles: `wat_app` (runtime, NOBYPASSRLS, ไม่ใช่ migration role), `wat_migrate` (DDL)

---

## 7. Out-of-scope (MVP-2) — ไม่สร้างใน MVP-1

`activities/ceremonies`, `personnel` (พระ/บุคลากร เกิน record อ้างอิง), `public_bookings`, `notifications`, `inventory_items/movements`, public ญาติโยม portal, public calendar — วางไว้เป็น entity อนาคต ไม่ implement ในแผนนี้

> อ้างอิง flow การเงินเชิงลึก (lifecycle/numbering/void) และ RLS pattern: ดูเอกสารสถาปัตยกรรมหลักของ workspace (`docs/architecture/finance-lifecycle.md`, `rls-prisma-pattern.md`) — สรุปที่จำเป็นถูกฝังในเอกสารนี้แล้วเพื่อให้ self-contained
