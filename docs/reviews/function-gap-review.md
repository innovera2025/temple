# Function Gap Review — ระบบจัดการวัด

**Repo:** `https://github.com/innovera2025/temple.git`  
**Local path:** `/Users/innovera/wat-management-system/temple`  
**Review date:** 2026-05-29

## ภาพรวมระบบปัจจุบัน

จากการ clone และ inspect repository จริง พบว่า repo นี้ยังเป็น **empty repository**:

- ไม่มี source code
- ไม่มี README/spec
- ไม่มี routes/controllers/API
- ไม่มี models/schema/migrations
- ไม่มี UI pages/components
- ไม่มี tests
- ไม่มี package/build configuration

ดังนั้นผลรีวิวนี้เป็น **requirements-level functional gap review** ไม่ใช่ code-backed review ของ function ที่ implement แล้ว

## Function ที่มีแล้ว

ยังไม่พบ function ที่ implement แล้วใน repository

- Temple profile: missing
- Monk/staff management: missing
- Donor CRM: missing
- Donation/receipt: missing
- Accounting: missing
- Event/ceremony booking: missing
- Inventory/assets: missing
- Reports/export: missing
- Users/roles/permissions: missing
- Audit log/backup: missing

## Function ที่ยังขาด

### 1. Project foundation / app scaffold
- **Priority:** Critical
- **เหตุผล:** ยังไม่มีโครงแอป, tech stack, routing, database, auth หรือ test setup
- **Suggested approach:** เลือก stack แล้วสร้าง scaffold พร้อม README, env example, lint/test/build commands

### 2. Users, roles, and permissions
- **Priority:** Critical
- **เหตุผล:** ระบบวัดมีข้อมูลการเงินและข้อมูลส่วนบุคคล ต้องแยกสิทธิ์ก่อนใช้งานจริง
- **Suggested approach:** สร้าง user model, role model, session/auth, middleware/guards, permission matrix

### 3. Audit log
- **Priority:** Critical
- **เหตุผล:** ข้อมูลบริจาค/บัญชีต้องตรวจสอบย้อนหลังได้ว่าใครแก้ไขอะไร เมื่อไหร่
- **Suggested approach:** สร้าง audit_logs table และ helper สำหรับบันทึก create/update/void/delete-sensitive actions

### 4. Donation intake and receipt/anumodana certificate
- **Priority:** Critical
- **เหตุผล:** เป็น workflow หลักของวัด และต้องมีเลขเอกสาร unique
- **Suggested approach:** สร้าง donors, donations, donation_categories, receipts พร้อม generate document number และ PDF/print/export ใน phase ถัดไป

### 5. Accounting income/expense ledger
- **Priority:** Critical
- **เหตุผล:** ต้องแยกรายรับรายจ่ายและแนบหลักฐาน ตรวจสอบได้
- **Suggested approach:** สร้าง ledger entries, categories, attachments, monthly summary, void/correction workflow

### 6. Donor / lay supporter CRM
- **Priority:** High
- **เหตุผล:** ต้องดูประวัติผู้บริจาค ติดต่อ และออกใบอนุโมทนาได้สะดวก
- **Suggested approach:** CRUD donor profiles, contact info, tags/segments, donation history timeline

### 7. Temple profile and master data
- **Priority:** High
- **เหตุผล:** ใช้เป็นข้อมูลพื้นฐานบนเอกสาร รายงาน และ public-facing screens
- **Suggested approach:** temple profile, address, contact, abbot, logo/images, document header/footer settings

### 8. Monk, novice, and staff management
- **Priority:** High
- **เหตุผล:** ระบบจัดการวัดต้องมีข้อมูลพระ/บุคลากรและหน้าที่/สถานะจำพรรษา
- **Suggested approach:** CRUD monks/staff, ordination info, rank/position, residence status, transfer history, documents

### 9. Event and ceremony booking
- **Priority:** High
- **เหตุผล:** งานพิธี/กิจกรรมเป็น operation หลัก เช่น งานศพ ทำบุญบ้าน งานบวช จองศาลา นิมนต์พระ
- **Suggested approach:** calendar, ceremony requests, schedule, assigned monks/staff, status workflow

### 10. Dashboard and reports/export
- **Priority:** High
- **เหตุผล:** กรรมการวัด/เจ้าหน้าที่ต้องเห็นภาพรวมและ export รายงานได้
- **Suggested approach:** dashboard cards, charts/tables, donation reports, accounting reports, PDF/Excel export

### 11. Inventory and temple assets
- **Priority:** Medium
- **เหตุผล:** ของบริจาค สังฆทาน และอุปกรณ์วัดต้องติดตามสต็อก/ยืมคืน
- **Suggested approach:** inventory items, stock movements, borrow/return, low-stock alerts

### 12. Backup/restore and import/export
- **Priority:** Medium
- **เหตุผล:** ลดความเสี่ยง data loss และช่วย migrate ข้อมูลเดิมจาก Excel
- **Suggested approach:** CSV/Excel import, scheduled backups, admin restore workflow

## Function ที่ควรเพิ่มทันที

1. App scaffold + README + dev/test/build commands
2. Database schema foundation
3. Auth + roles + permission matrix
4. Audit log foundation
5. Donor CRM
6. Donation intake
7. Receipt/anumodana document numbering
8. Accounting ledger
9. Temple profile/master data
10. Dashboard MVP

## Data model ที่ควรมีใน phase แรก

- `users`
- `roles`
- `permissions`
- `user_roles`
- `temples`
- `monks`
- `staff`
- `donors`
- `donation_categories`
- `donations`
- `receipts`
- `ledger_accounts`
- `ledger_entries`
- `attachments`
- `audit_logs`

Phase ถัดไป:

- `events`
- `ceremony_requests`
- `ceremony_assignments`
- `inventory_items`
- `inventory_movements`
- `reports_exports`
- `backup_jobs`

## ความเสี่ยงถ้า launch ตอนนี้

- **Security:** ยังไม่มี auth/permission
- **Accounting:** ยังไม่มี ledger, receipt, document numbering, void workflow
- **Privacy:** ยังไม่มี policy/permission สำหรับข้อมูลผู้บริจาคและพระ/บุคลากร
- **Data loss:** ยังไม่มี backup/restore
- **Operational:** ยังไม่มี workflow ให้เจ้าหน้าที่ใช้งานจริง
- **Audit:** ยังตรวจสอบย้อนหลังไม่ได้

## สรุป

ระบบยังไม่ได้เริ่ม implement ใน repo นี้ จึงยังไม่มี function ครบหรือขาดแบบอ้างอิงจาก code ได้ สิ่งที่ควรทำต่อคือเริ่มจาก scaffold + schema + auth/permission + audit log + donation/accounting MVP ก่อน แล้วค่อยต่อยอด event/ceremony และ inventory
