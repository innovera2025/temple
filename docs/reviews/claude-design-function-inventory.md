# Claude Design Extraction — temple-admin Function Inventory

**Source URL:** https://claude.ai/design/p/f2bad95c-3dfe-40c5-aee8-f43c45cf08b9?file=temple-admin%2Findex.html  
**Extraction date:** 2026-05-30  
**Extracted files:**

- `/Users/innovera/wat-management-system/artifacts/claude-design/temple-admin-index-from-save.html`
- `/Users/innovera/wat-management-system/artifacts/claude-design/temple-admin-index-from-save_files/_bootstrap.html`

## Extraction result

Chrome Save Page successfully captured the Claude Design runtime and embedded preview source. The important artifact is `_bootstrap.html` because it contains the rendered/transpiled app source for `temple-admin`, including these source module references:

- `icons.jsx`
- `data.jsx`
- `shell.jsx`
- `ds-screen.jsx`
- `screens-1.jsx`
- `screens-2.jsx`
- `screens-3.jsx`
- `role-extras.jsx`
- `admin-app.jsx`

The captured source includes key React functions/components such as:

- `LoginScreen`
- `RegisterForm`
- `RoleShell`
- `Dashboard`
- `DonationIntake`
- `DonorProfile`
- `AnumodanaDoc`
- `InnoveraView`
- `PublicView`
- plus shared UI components: `Btn`, `Badge`, `Card`, `Modal`, `Drawer`, `Toast`, `Toolbar`, `SearchBox`, `Sidebar`, `Topbar`, etc.

## Role / persona inventory

### 1. Temple internal users

Detected role labels / role values:

- `admin` — ผู้ดูแลวัด
- `finance` — เจ้าหน้าที่การเงิน
- `staff` — เจ้าหน้าที่ทั่วไป
- `auditor` — ผู้ตรวจสอบ / audit view
- temple personnel examples: เจ้าอาวาส, รองเจ้าอาวาส, พระวิทยากร, สามเณร, ไวยาวัจกร, แม่ครัว

### 2. Platform users

- `innovera` — Innovera / Super Admin console
- `Support` — support staff under platform account
- `Super Admin` — platform-level full management

### 3. Public users

- `public` — ญาติโยม / public devotee self-service portal

## Screen inventory

### A. Auth / onboarding

- Login screen
- Email/password login
- Social login buttons
- Demo role selector
- Register new temple account
- Accept terms / privacy
- Forgot password link

### B. Temple admin / staff console

Detected navigation labels:

1. แดชบอร์ดภาพรวม / แดชบอร์ด
2. บันทึก/แก้ไขการบริจาค / การบริจาค
3. ทะเบียนผู้บริจาค
4. ออกใบอนุโมทนาบัตร / ใบอนุโมทนาบัตร
5. บัญชีรายรับ-รายจ่าย
6. กระทบยอด/ปิดงวด
7. จัดการกิจกรรม/พิธี / กิจกรรมและพิธี
8. ทะเบียนพระ-เจ้าหน้าที่ / พระสงฆ์และเจ้าหน้าที่
9. รายงานและส่งออกข้อมูล / รายงานและส่งออก
10. จัดการสิทธิ์ผู้ใช้ / สิทธิ์ผู้ใช้งาน
11. บันทึกการใช้งาน (Audit) / บันทึกการใช้งาน
12. ระบบออกแบบ / Design System

### C. Innovera / Super Admin console

Detected navigation labels:

1. แดชบอร์ด
2. คำขอสมัครใช้งาน
3. จัดการวัดทั้งหมด
4. จัดการผู้ใช้ทั้งหมด
5. การแจ้งเตือน
6. ประวัติการดำเนินการ

### D. Public / ญาติโยม portal

Detected navigation labels:

1. หน้าแรก
2. จองบริการ
3. การจองของฉัน
4. ปฏิทินกิจกรรม
5. ร่วมบริจาค
6. การแจ้งเตือน
7. โปรไฟล์ของฉัน

## Function inventory

### 1. Authentication & onboarding

- Login with email/password
- Remember login checkbox
- Forgot password link
- Select demo role / perspective
- Register temple account
- Validate required registration fields
- Terms/privacy acceptance

### 2. Donation management

- Create donation record
- Edit donation record
- Track donor profile
- Donation intake workflow
- Donation status labels:
  - รอตรวจสอบ
  - บันทึกแล้ว
  - กระทบยอดแล้ว
  - ยกเลิก
- Action labels:
  - สร้าง
  - แก้ไข
  - ออกเอกสาร
  - กระทบยอด
  - ยกเลิก
  - ส่งออก

### 3. Donor / devotee management

- Donor registry
- Donor profile view
- Search/filter donors
- Link donation history to donor

### 4. Receipt / Anumodana document

- Issue ใบอนุโมทนาบัตร
- Track queue: รอออกใบอนุโมทนาบัตร
- Preview/print/export document
- Thai baht text conversion function detected: `bahtText`

### 5. Finance / ledger

- Income/expense ledger
- Dashboard chart: income/expense
- Reconciliation / close period
- Queue: รายการรอกระทบยอด
- Export reports

### 6. Activity / ceremony management

- Manage activities/ceremonies
- Activity request review queue: คำขอจัดกิจกรรมรอตรวจสอบ
- Activity calendar types:
  - ทำวัตร/ปฏิบัติงาน
  - วันพระ
  - งานบุญ
  - อบรม/ปฏิบัติธรรม
- Calendar view and list view implied by public portal copy
- Flag activities for public notification: แจ้งเตือนญาติโยม

### 7. Personnel registry

- Manage monks and staff
- Personnel role labels include: เจ้าอาวาส, รองเจ้าอาวาส, พระวิทยากร, สามเณร, ไวยาวัจกร, แม่ครัว

### 8. Reports & exports

- Report screen
- Export data action
- Finance/report export implied by nav/action labels

### 9. User permissions & audit

- Manage user rights
- Audit log screen
- Audit actions/log examples:
  - เข้าระบบ
  - สร้าง
  - แก้ไข
  - ยกเลิก
  - กระทบยอด
  - ส่งออก

### 10. Platform tenant management — Innovera / Super Admin

- Platform dashboard
- KPI cards:
  - วัดทั้งหมด
  - ใช้งาน
  - รออนุมัติ
  - ถูกระงับ
- Temple growth chart: การเติบโตของวัดในระบบ
- Temple status composition: สัดส่วนสถานะวัด
- Review temple signup applications
- Approve application
- Reject application
- Manage all temples
- Suspend temple
- Resume temple
- Platform audit history

### 11. Platform user management

- Manage all users across all temples
- KPI cards:
  - ผู้ใช้ทั้งหมด
  - ใช้งานอยู่
  - ผู้ใช้ของวัด
  - ทีม Innovera
- Search users by name/email/temple
- Filter by scope:
  - all
  - platform
  - temple
- Suspend/disable user
- Re-enable user
- Log user management actions into platform audit

### 12. Platform notifications

- New temple application notification
- Suspended temple notification
- Monthly report notification
- Navigation from notification to related page implied by Claude handoff copy

### 13. Public / ญาติโยม self-service

- Public home dashboard
- KPI cards:
  - การจอง
  - รอยืนยัน
  - ยอดบุญ
  - แจ้งเตือนใหม่
- Quick service buttons
- Booking service request
- View own bookings
- Donate / ร่วมบริจาค
- View public activity calendar
- Receive temple announcements
- Read/unread notifications
- Mark one notification or all notifications as read
- Public profile page

## Candidate data model

### Core tenant/platform

- `Temple`
  - id, name, province, contact, phone, status, members, reason
- `TempleApplication`
  - id, templeName, province, contact, phone, date, status
- `PlatformUser`
  - id, name, email, temple, role, platform, status, lastLogin
- `AuditLog`
  - id, timestamp, actor, action, target, reason, class/status

### Temple operations

- `User`
  - id, name, email, role, templeId, status, lastLogin
- `Donor`
  - id, name, contact, donorType, history
- `Donation`
  - id, donorId, amount, method, purpose, status, receiptId, createdBy, reconciledAt
- `Receipt` / `AnumodanaDocument`
  - id, donationId, receiptNo, issuedAt, voidedAt, print/export status
- `LedgerEntry`
  - id, date, type, category, amount, reference, status, periodId
- `ReconciliationPeriod`
  - id, period, status, closedBy, closedAt
- `Activity`
  - id, title, type, date, location, publicNotify, status
- `Personnel`
  - id, name, role, contact, status
- `PublicBooking`
  - id, publicUserId, serviceType, date, status, notes
- `Notification`
  - id, audience, title, body, type, readAt, relatedEntity

## Candidate API map

### Auth

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/register-temple`
- `POST /auth/forgot-password`

### Temple internal

- `GET /dashboard`
- `GET/POST /donations`
- `GET/PATCH /donations/:id`
- `POST /donations/:id/reconcile`
- `POST /donations/:id/void`
- `GET/POST /donors`
- `GET /donors/:id`
- `POST /receipts`
- `GET /receipts/:id/preview`
- `POST /receipts/:id/void`
- `GET/POST /ledger-entries`
- `POST /periods/:id/close`
- `GET/POST /activities`
- `GET/POST /personnel`
- `GET /reports/*`
- `GET/POST /users`
- `GET /audit-logs`

### Platform / Innovera

- `GET /platform/dashboard`
- `GET /platform/applications`
- `POST /platform/applications/:id/approve`
- `POST /platform/applications/:id/reject`
- `GET /platform/temples`
- `POST /platform/temples/:id/suspend`
- `POST /platform/temples/:id/resume`
- `GET /platform/users`
- `POST /platform/users/:id/disable`
- `POST /platform/users/:id/enable`
- `GET /platform/notifications`
- `GET /platform/audit-logs`

### Public / ญาติโยม

- `GET /public/home`
- `GET/POST /public/bookings`
- `GET /public/bookings/:id`
- `GET /public/activities`
- `POST /public/donations`
- `GET /public/notifications`
- `POST /public/notifications/:id/read`
- `POST /public/notifications/read-all`
- `GET/PATCH /public/profile`

## MVP-1 recommendation

Use the Claude Design as **broad product target**, but implement MVP-1 in finance-first order:

1. Multi-tenant foundation
   - Temple tenant
   - Users/roles
   - Auth
   - Audit log
2. Donation workflow
   - Donor registry
   - Donation create/edit/void
   - Receipt issue/preview/void
3. Ledger workflow
   - Income/expense entries
   - Reconciliation / close period
   - Basic finance dashboard
4. Reports/export
   - Donation report
   - Receipt report
   - Ledger export
5. Platform admin
   - Temple applications
   - Manage tenants
   - Manage users across tenants
6. Public portal later
   - Booking/calendar/notifications can be MVP-2 unless required for launch

## Gaps / caution for implementation

- Claude Design is a prototype with demo state and client-side actions; do not treat it as backend architecture.
- Need confirm legal/tax requirements for ใบอนุโมทนาบัตร before implementing final receipt numbering/void/reissue rules.
- Need strict RBAC for finance actions: create/edit/void/reconcile/export should be auditable.
- Platform-level user management must not allow cross-tenant data leakage.
- Public portal creates additional privacy/security scope; consider deferring if finance MVP is primary.
