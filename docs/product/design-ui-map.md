# แผนผัง UI ตามดีไซน์ (Design UI Map) — ระบบจัดการวัด

> เอกสารนี้ดึงข้อมูลทั้งหมดจากดีไซน์ต้นฉบับที่ export ไว้ที่
> `/Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/`
> (latest user-provided revision; previous revision remains at `.../ระบบจัดการวัด-2026-06-02/extracted/` for comparison)
> เอกสารนี้ **ไม่ใช่** smoke shell ปัจจุบันใน `apps/web/src/smoke/` และ **ไม่ใช่** Agent Control Tower (`apps/web/src/control-tower.ts` ซึ่งเป็น dev artifact ที่ต้องอยู่นอก UI หลักของผลิตภัณฑ์)
> ทุกข้อความในเอกสารนี้อ้างอิงจาก EXTRACTED DESIGN DATA ต่อ JSX module หากดีไซน์ไม่ได้ระบุ จะเขียนกำกับว่า "ไม่พบในดีไซน์" แทนการเดา
> โมดูล JSX ที่ถูกถอดออกมา: `app.jsx`, `auth.jsx`, `apply.jsx`, `dashboard.jsx`, `donate.jsx`, `members.jsx`, `bookings.jsx`, `calendar.jsx`, `settings.jsx`, `temple-settings.jsx`, `innovera.jsx`, `platform-data.jsx`, `shared.jsx`, `temple-admin/icons.jsx`, `temple-admin/data.jsx`, `temple-admin/shell.jsx`, `temple-admin/ds-screen.jsx`, `temple-admin/screens-1.jsx`, `temple-admin/screens-2.jsx`, `temple-admin/screens-3.jsx`, `temple-admin/role-extras.jsx`, `temple-admin/admin-app.jsx`, `temple-admin/ds.css`

---

## 1. บทบาทและ Personas (Roles & Personas)

ดีไซน์แบ่งผู้ใช้เป็น 3 กลุ่มใหญ่ ตามที่พบใน `admin-app.jsx` (`ACCOUNTS`, `VIEWS`, `roleNameOf()`, `permOf()`) และ `data.jsx` (role definitions).

> **โมเดลสิทธิ์จริงของ product (canonical — product decision):** มี **3 กลุ่มระดับบนสุด**
> 1. `platform_owner` — **เจ้าของแพลตฟอร์ม** (Innovera plane; เข้าผ่าน `/platform/auth`, ไม่มี tenant context โดยปริยาย; map จาก `PlatformRole` super_admin/support)
> 2. `temple_owner` — **เจ้าของวัด / ผู้ดูแลวัด** (tenant `admin`; สิทธิ์เต็มภายในวัดของตน)
> 3. `temple_user` — **คนใช้งานวัด** (tenant `finance`/`staff` เป็น capability subroles ของกลุ่มนี้)
>
> โมเดลนี้อยู่ที่ `packages/shared` (`access-model.ts`: `ACCESS_GROUPS`, `accessGroupForTenantRole`, `accessGroupForPlatformRole`) — เป็นการ map role ที่ backend รองรับจริงเข้า 3 กลุ่ม **ไม่ได้เพิ่ม DB enum ใหม่**.
> ⚠️ **`auditor` เป็น role ใน design prototype เท่านั้น** — ไม่มีใน DB enum (`TenantRole = admin|finance|staff`), seed, หรือ API จึงถูกถอดออกจาก product role model (`apps/web/src/layout/nav.ts`) แล้ว **ห้ามนำกลับเข้ามาใน UI/runtime** เว้นแต่จะมี backend/schema/seed รองรับจริง.

### 1.1 ฝั่งวัด (Temple staff — เข้าผ่าน `RoleShell` + `Sidebar`/`Topbar`)

| role id | access group (canonical) | ป้ายภาษาไทย (ปัจจุบัน) | ขอบเขต | สี badge (จาก Topbar) |
|---|---|---|---|---|
| `admin` | `temple_owner` — เจ้าของวัด | เจ้าของวัด / ผู้ดูแล | เข้าถึงและจัดการทุกส่วนภายในวัดของตน | `reconciled` (น้ำเงิน) |
| `finance` | `temple_user` — คนใช้งานวัด | คนใช้งานวัด · การเงิน | บันทึกบริจาค บัญชี ออกใบอนุโมทนา | `credit` (เขียว) |
| `staff` | `temple_user` — คนใช้งานวัด | คนใช้งานวัด · งานทั่วไป | งานทะเบียน กิจกรรม สมาชิก | `pending` (เหลือง-น้ำตาล) |
| ~~`auditor`~~ | — | _(design prototype เท่านั้น — ถอดออกจาก product แล้ว)_ | _ไม่มีใน product runtime_ | — |

ผู้ใช้ตัวอย่างในดีไซน์: **ประยูร พงษ์ศักดิ์** (role = ผู้ดูแลระบบ), อีเมล `prayoon@wat.local`

### 1.2 ฝั่งแพลตฟอร์ม (Platform / Innovera)

| role id | ป้าย/คอนเซ็ปต์ในดีไซน์ | ที่มา |
|---|---|---|
| `innovera` | เจ้าของแพลตฟอร์ม / Innovera Console / บริหารแพลตฟอร์ม | `InnoveraView` (admin-app.jsx) |

หมายเหตุ: ดีไซน์ระบุเพียง role เดียวคือ `innovera` สำหรับฝั่งแพลตฟอร์ม **ไม่พบ** role ย่อย "support" หรือ "super-admin" แยกออกมาในดีไซน์ที่ถอดได้ (โครงสร้างเป็น console เดียว). Backend ที่มีจริงรองรับ `platform-users` และ `break-glass` ซึ่งสอดคล้องกับแนวคิด super-admin/support แต่ดีไซน์ไม่ได้แยก persona ไว้

### 1.3 ฝั่งสาธารณะ (Public / ญาติโยม-devotee)

| role id | ป้ายในดีไซน์ | ที่มา |
|---|---|---|
| `public` | ผู้ใช้งานทั่วไป / ญาติโยม ("เจริญพร คุณญาติโยม") | `PublicView` (admin-app.jsx) |

ผู้ใช้ตัวอย่าง: **ญาติโยม ใจบุญ**, สมาชิกตั้งแต่ 2558, โทร 081-234-5678, อีเมล `jaiboon@example.com`

---

## 2. เมนูนำทางต่อบทบาท (Navigation per role)

> สำคัญ: ดีไซน์มี **เมนูชุดที่ไม่ตรงกันหลายชุด** ในแต่ละ module ที่ถอดได้ ชุดที่เป็น "ของจริง" สำหรับฝั่งวัดคือ `NAV` array ใน `shell.jsx` (4 กลุ่ม) ซึ่ง `Sidebar` กรองด้วย `can()` ตามสิทธิ์ ส่วนเมนูใน `ds-screen.jsx`/`screens-1.jsx`/`screens-3.jsx` เป็นชุดเก่า/ตัวอย่างที่ไม่ตรงกัน — บันทึกไว้เป็น Open Question (ข้อ 11)

### 2.1 เมนูฝั่งวัด — ชุดหลักจาก `shell.jsx` NAV (จัดเป็น 4 กลุ่ม, แสดงทุก role แล้วกรองด้วย can())

| ลำดับ | กลุ่ม | เมนู (ป้ายไทยตรงตามดีไซน์) | สิทธิ์ที่อ้างถึง (perm key) |
|---|---|---|---|
| 1 | ภาพรวม | แดชบอร์ด | `dash` |
| 2 | การเงินและบริจาค | การบริจาค | `don` |
| 3 | การเงินและบริจาค | ทะเบียนผู้บริจาค | `don`/donors |
| 4 | การเงินและบริจาค | ใบอนุโมทนาบัตร | `rcpt` |
| 5 | การเงินและบริจาค | บัญชีรายรับ-รายจ่าย | `ledg` |
| 6 | งานวัด | กิจกรรมและพิธี | `evt` |
| 7 | งานวัด | พระสงฆ์และเจ้าหน้าที่ | `ppl` |
| 8 | รายงานและระบบ | รายงานและส่งออก | `rep` |
| 9 | รายงานและระบบ | สิทธิ์ผู้ใช้งาน | `role` |
| 10 | รายงานและระบบ | บันทึกการใช้งาน | `audit` |
| 11 | รายงานและระบบ | ระบบออกแบบ (Design System) | — |

แบรนด์ใน Sidebar: **วัดธรรมสถิตวนาราม** / ระบบบริหารจัดการวัด
Topbar breadcrumb: `temple > page title` (PAGE_TITLES lookup), มี SearchBox placeholder "ค้นหาใบเสร็จ ผู้บริจาค รายการบัญชี..." และปุ่ม "ออกจากระบบ"

### 2.2 เมนูฝั่งแพลตฟอร์ม (`InnoveraView`)

| ลำดับ | เมนู (ป้ายไทย) | tab id (จาก admin-app.jsx) |
|---|---|---|
| 1 | แดชบอร์ด / ภาพรวม | `overview` |
| 2 | คำขอสมัครใช้งาน | `apps` |
| 3 | จัดการวัดทั้งหมด / วัด | `temples` |
| 4 | จัดการผู้ใช้ทั้งหมด / ผู้ใช้งาน | `users` |
| 5 | การแจ้งเตือน | `notifs` |
| 6 | ประวัติการดำเนินการ | `audit` |

แบรนด์: **Innovera Console** / บริหารแพลตฟอร์ม. (หมายเหตุ: admin-app-B ยังพบป้าย "แอปพลิเคชัน" เป็นแท็บแยกในตาราง users — แต่ NAV หลักใช้ "คำขอสมัครใช้งาน")

### 2.3 เมนูฝั่งสาธารณะ (`PublicView`)

| ลำดับ | เมนู (ป้ายไทย) | tab id | กลุ่ม |
|---|---|---|---|
| 1 | หน้าแรก | `home` | — |
| 2 | จองบริการ | `book` | ของฉัน |
| 3 | การจองของฉัน | `mybook` | ของฉัน |
| 4 | ปฏิทินกิจกรรม | `calendar` | ร่วมกับวัด |
| 5 | ร่วมบริจาค | `donate` | ร่วมกับวัด |
| 6 | การแจ้งเตือน | `notifs` | บัญชี |
| 7 | โปรไฟล์ของฉัน | `profile` | บัญชี |

แบรนด์: ป้าย "เจริญพร คุณญาติโยม", role label "ผู้ใช้งานทั่วไป"

### 2.4 ชุดเมนูที่ไม่ตรงกัน (legacy/ตัวอย่าง) — บันทึกไว้เพื่อความครบถ้วน
- `ds-screen.jsx` แสดงเมนูแบบเก่า: admin = [ภาพรวม, ข้อมูลวัด, พระสงฆ์/สามเณร, บุคลากร, ญาติโยม/ผู้บริจาค, งานบุญ/พิธี, บัญชี, สิทธิ์, รายงาน]; finance = [ภาพรวม, ญาติโยม/ผู้บริจาค, รับบริจาค, บัญชี, รายงาน]; staff = [ภาพรวม, ข้อมูลวัด, พระสงฆ์/สามเณร, บุคลากร, งานบุญ/พิธี]
- `screens-1.jsx`, `screens-3.jsx` มีชุดสั้นกว่าอีก (เช่น admin = [แดชบอร์ด, รับบริจาค, บริหารงาน, รายงาน, ผู้ใช้และสิทธิ์, ตั้งค่า])

**สรุป:** ใช้ `shell.jsx` NAV (ข้อ 2.1) เป็นเกณฑ์สำหรับ port — ชุดอื่นถือว่า outdated

---

## 3. รายการหน้าจอ/คอมโพเนนต์ (Screen inventory)

### 3.1 Auth (เข้าสู่ระบบ)

| คอมโพเนนต์ | module | จุดประสงค์ |
|---|---|---|
| `LoginScreen` | screens-1.jsx / admin-app.jsx (บรรทัด ~14600) | เข้าสู่ระบบ email/password มีโหมดสลับ login/register, แบรนด์/ตราวัดด้านซ้าย, ฟอร์มด้านขวา, จุดเด่น 3 ข้อ (บริจาค, บัญชี, สิทธิ์) |
| `RegisterForm` | screens-1.jsx (บรรทัด ~14229) | ฟอร์มสมัครสมาชิก: ชื่อ-นามสกุล, อีเมล, รหัสผ่าน, ยืนยันรหัสผ่าน, ยอมรับเงื่อนไข; default role = `staff`; validation ฝั่ง client |
| `SocialButtons` | screens-1.jsx | ปุ่ม OAuth/social login (Google ฯลฯ) เหนือฟอร์ม email |

### 3.2 Temple console (คอนโซลฝั่งวัด)

| คอมโพเนนต์ | module | จุดประสงค์ |
|---|---|---|
| `Dashboard` | screens-1.jsx (~4741) | แดชบอร์ดหลัก: PageHead, KPI 4 ใบ (รับบริจาคเดือนนี้ ฿96,000 +18%, รายจ่ายเดือนนี้ ฿60,030 -12%, ยอดคงเหลือทุกกองทุน ฿1,488,000, ผู้บริจาคใหม่ 12 ราย), กราฟรายรับ-รายจ่าย 6 เดือน, คิวงานที่ต้องดำเนินการ 3 รายการ, ตารางการบริจาคล่าสุด 5 แถว |
| `DonationIntake` | screens-2.jsx | ฟอร์มบันทึก/แก้ไขการบริจาค: ชื่อผู้บริจาค, ประเภท, ผู้ไม่ประสงค์ออกนาม, ที่อยู่, เงินบริจาค, กองทุน, ช่องทาง; actions: สร้าง/แก้ไข/ยกเลิก(void)/ออกใบอนุโมทนา |
| `DonorProfile` | screens-2.jsx | โปรไฟล์ผู้บริจาค (CRM): ชื่อ, โทร, ที่อยู่, อีเมล, ประเภท + ประวัติบริจาค + filter ตามกองทุน/ช่องทาง/ช่วงเวลา |
| `AnumodanaDoc` | screens-2.jsx (~1121) | เอกสารใบอนุโมทนาบัตร: ตราวัด (ดอกบัว), ชื่อวัด, เลขที่, วันที่, จำนวนเงินเป็นตัวอักษรไทย (`bahtText()`), ชื่อผู้บริจาค, ประเภท, กองทุน, ช่องทาง, ข้อความ "ขออนุโมทนาบุญแด่" |
| `ReceiptScreen` | screens-2.jsx (~7513) | รายการใบอนุโมทนา: เลขที่, ชื่อ, จำนวน, กองทุน, วันที่, สถานะ; actions: preview/download/email/void; render `AnumodanaDoc` เมื่อเลือก |
| `Ledger` | screens-2.jsx (~8055) | บัญชีรายรับ-รายจ่าย: วันที่, รายละเอียด, จำนวน, สถานะ; แท็บกรองตามชนิด (in/ex/all) และสถานะ; actions: reconcile, void; แสดงยอดรวม |
| `LedgerEntryModal` | screens-2.jsx (~7775) | ฟอร์มเพิ่มรายการบัญชี: วันที่, หมวดบัญชี, รายละเอียด, จำนวนเงิน, เอกสารอ้างอิง |
| `EventBooking` | screens-2.jsx (~9024) | ปฏิทิน + คิวจองกิจกรรม: สถานะ รอตรวจสอบ/ยืนยันแล้ว; actions: ยืนยัน, ดูรายละเอียด |
| `EventModal` | screens-2.jsx (~9712) | สร้าง/แก้ไขงาน-พิธี: ชื่องาน/พิธี, ประเภท (งานบุญ/วันพระ/ทำวัตร/อบรม-ปฏิบัติธรรม), สถานที่, วันที่, เวลาเริ่ม/สิ้นสุด, จำนวนผู้ร่วมงาน, แจ้งเตือนญาติโยม |
| `People` | screens-3.jsx (~10226) | ทะเบียนพระ/เจ้าหน้าที่: ฉายา/ชื่อ, ประเภท, ตำแหน่ง, พรรษา, สังกัด/ติดต่อ, สถานะ; filter ทั้งหมด/พระ-เณร/เจ้าหน้าที่; drawer รายละเอียด |
| `PersonForm` | screens-3.jsx (~9963) | เพิ่ม/แก้ไขบุคลากร: kind (พระภิกษุ/สามเณร/เจ้าหน้าที่), ฉายา/ชื่อ, ตำแหน่ง, พรรษา (เฉพาะพระ), กุฏิ, โทร |
| `Reports` | screens-3.jsx (~10826) | สร้าง/ส่งออกรายงาน 6 ประเภท (บริจาค, งบรายรับ-รายจ่าย, ผู้บริจาค, ลดหย่อนภาษี, กิจกรรม, ความคืบหน้ากองทุน); รูปแบบ PDF/Excel/CSV; ช่วงเวลา + preset (เดือนนี้/ไตรมาสนี้/ปีนี้) |
| `Roles` | screens-3.jsx (~11543) | จัดการผู้ใช้ + ตารางสิทธิ์: แท็บ "บัญชีผู้ใช้งาน" และ "บทบาทและสิทธิ์"; matrix แถว=ฟังก์ชัน × คอลัมน์=role; ค่าวน none→ดู→แก้ไข→จัดการ |
| `UserModal` | screens-3.jsx (~11261) | สร้าง/แก้ไขผู้ใช้: ชื่อ-นามสกุล, อีเมล, บทบาท, สถานะ (active/disabled); ส่งอีเมลตั้งรหัสผ่านตอนสร้าง |
| `Audit` | screens-3.jsx (~12571) | บันทึกการใช้งาน: เวลา, ผู้ใช้งาน, การกระทำ, รายการ/รายละเอียด, IP; filter ตาม action + ค้นหา; ปุ่มส่งออก; ระบุ "ลบไม่ได้" |

### 3.3 Platform console (`InnoveraView` — admin-app.jsx)

| คอมโพเนนต์/แท็บ | module | จุดประสงค์ |
|---|---|---|
| `InnoveraView` (overview) | admin-app.jsx (~15897) | ภาพรวมแพลตฟอร์ม: ความเคลื่อนไหวล่าสุด, คำขอสมัครใช้งาน, วัดที่รอการจัดการ |
| AdminDashboard-Users | admin-app.jsx (~17200) | จัดการผู้ใช้ทั้งหมด: KPI ผู้ใช้วัด vs ทีม Innovera, ค้นหา/กรอง (scope all/temple/platform), ตาราง: ชื่อ+อีเมล, วัด/สังกัด, บทบาท, เข้าระบบล่าสุด, สถานะ, ระงับ/เปิดใช้ |
| AdminDashboard-Notifications | admin-app.jsx (~17685) | การแจ้งเตือนระบบ: คำขอสมัครใหม่ (pending), วัดถูกระงับ (suspended), รายงานประจำเดือน |
| AdminDashboard-AuditLog | admin-app.jsx (~17850) | ประวัติการดำเนินการ: badge, target, เหตุผล, actor, เวลา; ระบุ "ลบไม่ได้" |

แท็บอื่นที่ NAV ระบุแต่ไม่มีรายละเอียด extract: `apps` (คำขอสมัคร), `temples` (จัดการวัด)

### 3.4 Public portal (`PublicView` — admin-app.jsx, ~18108)

| คอมโพเนนต์ | จุดประสงค์ |
|---|---|
| PublicView-Home | หน้าแรกญาติโยม: KPI 4 ใบ (จำนวนการจอง, รอตรวจสอบ, ยอดบริจาค, แจ้งเตือนที่ยังไม่อ่าน), การ์ดบริการ, สรุปกิจกรรม + การบริจาค |
| PublicView-BookingFlow | จองบริการ: การ์ดบริการ (จองเมรุ/ฌาปนกิจ, แจ้งขอบวช, จองกุฏิ/พักปฏิบัติธรรม), date picker + time select + note; ข้อความ "ตรวจสอบและติดต่อกลับภายใน 24–36 ชม." |
| PublicView-MyBookings | การจองของฉัน: ตาราง รหัส/บริการ/รายละเอียด/วันที่/สถานะ; badge confirmed/receipt/rejected/pending |
| PublicView-Donate | ร่วมบริจาคออนไลน์: เลือกกองทุน, ชิปจำนวนเงิน (100/500/1000/2000), input ฿; ข้อความเกร็ดธรรมะด้านขวา |
| PublicView-Calendar | ปฏิทินกิจกรรมวัด: filter + รายการกิจกรรม พร้อม badge แจ้งเตือน |
| PublicView-Notifications | ศูนย์การแจ้งเตือนญาติโยม (`LAY_NOTIFS`), กรอง unread |
| PublicView-Profile | โปรไฟล์ (อ่านอย่างเดียว): ชื่อ, โทร, อีเมล, ที่อยู่สำหรับใบอนุโมทนา; ไม่มีปุ่ม submit |

### 3.5 Layout (เลย์เอาต์)

| คอมโพเนนต์ | module | จุดประสงค์ |
|---|---|---|
| `RoleShell` | shell.jsx / admin-app.jsx (~15278) | shell เต็มหน้า: sidebar + topbar + main; props `{brand, groups, page, setPage, badgeKind, badgeText, onLogout}`; scroll-to-top เมื่อเปลี่ยนหน้า; backdrop สำหรับ mobile |
| `Sidebar` | shell.jsx (~2739) | เมนูซ้าย: brand, nav groups (กรองด้วย `can()`), footer user avatar, ปุ่มออกจากระบบ, count badge ต่อเมนู |
| `Topbar` | shell.jsx (~2960) | แถบบน: ปุ่มเมนู (mobile), breadcrumb (วัด > page), SearchBox, role badge |
| `AdminApp` | admin-app.jsx (~20033) | routing shell ระดับบนสุด: login → dispatch ไป InnoveraView / PublicView / RoleShell(staff) ตาม role |
| `Modal` | shell.jsx / ds-screen.jsx (~2381) | dialog กลางจอ + scrim; header มีปุ่ม x; `wide` = 720px |
| `Drawer` | shell.jsx / ds-screen.jsx (~2477) | panel เลื่อนจากข้าง; sub ใช้ monospace; รองรับ badge ใน header |

### 3.6 Shared / Design system (`ds-screen.jsx` + `shell.jsx`)

| คอมโพเนนต์ | จุดประสงค์ |
|---|---|
| `Btn` | ปุ่ม variants: primary/secondary/tertiary/danger × size sm/md/lg + icon (`btn btn-{variant} btn-{size}`) |
| `Badge` | ป้ายสถานะ kind: credit/debit/pending/reconciled/void/accent/neutral + `dot` + `sq` |
| `Card` | container มี `pad`, มี `card-head`/`card-pad`; border 1px solid var(--border), radius var(--r) |
| `Money` | format เงินด้วย `window.baht()` + class credit(เขียว)/debit(แดง), ใช้ tabular numerals |
| `Empty` | empty state: icon (default 'box'), title, desc, action |
| `Field` | wrapper ฟอร์ม: label, hint, required, error state + error-text, `full` |
| `ErrorSummary` | สรุป validation error + ลิงก์ focus ไป error แรก, แสดง icon alert + จำนวน |
| `Toast` | แจ้งเตือนชั่วคราว + icon checkCircle; auto-clear 2600ms (admin-app-B) |
| `Toolbar` | container แนวนอน (`div.t-toolbar`) จัดกลุ่ม controls |
| `SearchBox` | input ค้นหา + icon, กว้าง 240px, bg var(--surface), placeholder default "ค้นหา" |
| `PageHead` | header หน้า: eyebrow, title (h1), desc, actions |
| `KPI` | การ์ดเมตริก: label, icon, value, delta, foot |
| `MiniBars` | bar chart แนวนอนสำหรับ growth/KPI (role-extras.jsx) |
| `ActivityCalendar` | ปฏิทินกิจกรรมวัด (role-extras.jsx) มิถุนายน ๒๕๖๙: grid 7 คอลัมน์ / list view, filter chips ตามชนิดกิจกรรม, การ์ดรายละเอียดต่อวัน |
| icon set | icons.jsx — 36 icon (viewBox 0 0 24 24, strokeWidth 1.75 default / 2 bold / 2.2 checkCircle) ดูข้อ 5 |

---

## 4. ดีไซน์ Shared Primitives และ Design Tokens

### 4.1 Primitives (สรุปจาก ds-screen.jsx + shell.jsx)
ดู §3.6 — มี `Btn`, `Badge`, `Card`, `Modal`, `Drawer`, `Toast`, `SearchBox`, `Money`, `Empty`, `Field`, `ErrorSummary`, `Toolbar`, `PageHead`, `KPI`

### 4.2 สี (Colors) — **ค่ายืนยันชัดเจน** (จาก ds-screen.jsx Swatch)

| token | hex | ความหมาย |
|---|---|---|
| `--paper` | `#f4f2ec` | พื้นหลัง (paper) |
| `--surface` | `#ffffff` | พื้นผิวหลัก |
| `--ink` | `#1d1a16` | ตัวอักษรหลัก |
| `--accent` | `#a4691b` | สีหลัก (หญ้าฝรั่น / temple brown) |
| `--credit` | `#2f6b4d` | รายรับ (เขียว) |
| `--debit` | `#b0492f` | รายจ่าย (แดง-ส้ม) |
| `--pending` | `#976611` | รอตรวจสอบ (เหลือง-น้ำตาล) |
| `--reconciled` | `#3a627c` | กระทบยอดแล้ว (น้ำเงิน-เทา) |

โทเคนที่อ้างถึงแต่ไม่ระบุ hex (ใช้ผ่าน var()): `--ink-2`, `--ink-3`, `--surface-2`, `--surface-3`, `--border`, `--accent-tint`, `--accent-tint-2`, `--accent-line`, `--void`, `--neutral`, `--credit-tint`, `--pending-tint`, `--reconciled-tint`

สี social/แพลตฟอร์ม (admin-app): `#1877F2` (Facebook), `#4285F4`/`#34A853`/`#FBBC05`/`#EA4335` (Google), `#FF6B6B`

### 4.3 ฟอนต์ (Fonts) — **ยืนยันชัดเจน**
- `IBM Plex Sans Thai` — body/UI (default sans)
- `Noto Serif Thai` — `--font-serif` เอกสารทางการ (ใบอนุโมทนา, เกร็ดธรรมะ; lineHeight 1.8/2)
- `IBM Plex Mono` — monospace สำหรับ ID/code (เช่น Drawer sub, 12px)

### 4.4 มุมโค้ง (Radii)
- ฐาน `--r` = **4px** ("มุมโค้ง 4px"); ตัวแปร: `--r-xs`, `--r-sm`, `--r`, `--r-lg`; `50%` สำหรับ status dot

### 4.5 ระยะห่าง (Spacing)
- กริด 4px (class `g-4`); ค่าที่พบใช้: 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32px
- Modal `wide` max-width: `min(720px, calc(100vw - 32px))`

### 4.6 stroke ของ icon
- default `1.75`; bold (plus/check/x/chevron/arrow) `2`; หนาสุด (checkCircle) `2.2`

> **ความครบถ้วนของ token:** สี 8 ตัวหลัก + ฟอนต์ + radii ฐาน = **ยืนยันชัด**. ส่วน tint/border/ink-2/ink-3 ฯลฯ ใช้ผ่าน CSS var โดย **ไม่พบ hex ในดีไซน์ที่ถอดได้** — ต้องดึงค่าจริงจาก CSS `:root` ใน `_bootstrap.html` ตอน port (flag ไว้)

---

## 5. ป้ายและข้อความภาษาไทยสำคัญ (Status enums, actions, headings)

### 5.1 สถานะการบริจาค (Donation)
`ออกใบแล้ว`, `รอออกใบ` — และในฟอร์ม: `รอตรวจสอบ`, `บันทึกแล้ว`, `กระทบยอดแล้ว`, `ยกเลิก`

### 5.2 สถานะบัญชี (Ledger — ค่าระบบ + ป้ายไทย)
| value | ป้ายไทย |
|---|---|
| `reconciled` | กระทบยอดแล้ว |
| `posted` | บันทึกแล้ว |
| `pending` | รอตรวจสอบ |
| `void` | ยกเลิก |

### 5.3 สถานะกิจกรรม / การจอง
`ยืนยันแล้ว`, `รอตรวจสอบ`; (public booking เพิ่ม: `รอยืนยัน`, `ออกใบแล้ว`, `ปฏิเสธ`)

### 5.4 บุคลากร (People)
- kind: `พระภิกษุ`, `สามเณร`, `เจ้าหน้าที่`
- สถานะ: `จำพรรษา`, `ปฏิบัติงาน`
- ตำแหน่ง: เจ้าอาวาส, รองเจ้าอาวาส, พระวิทยากร, ไวยาวัจกร, แม่ครัว

### 5.5 ประเภทผู้บริจาค (Donor type)
`บุคคล`, `ครอบครัว`, `นิติบุคคล`, `ไม่ระบุ`

### 5.6 กองทุน (Funds)
กองทุนบูรณะอุโบสถ, กองทุนภัตตาหารพระสงฆ์, กองทุนการศึกษาสามเณร, ทำบุญทั่วไป

### 5.7 ช่องทางรับเงิน (Channel)
พร้อมเพย์, โอนเงิน/โอนธนาคาร, เงินสด, ตู้บริจาค, เช็คธนาคาร, ออนไลน์

### 5.8 ชนิด action (Audit)
สร้าง (`create`), แก้ไข (`update`), ออกเอกสาร (`issue`), กระทบยอด (`reconcile`), ยกเลิก (`void`), เข้าระบบ (`login`), ส่งออก (`export`)

### 5.9 หมวดบัญชี (ตัวอย่าง)
เงินบริจาค, ค่าสาธารณูปโภค, ค่าภัตตาหาร, ค่าบูรณะ, ค่าตอบแทนเจ้าหน้าที่, ค่าน้ำประปา

### 5.10 หัวข้อ/ปุ่มสำคัญ
- Dashboard: รับบริจาคเดือนนี้, รายจ่ายเดือนนี้, ยอดคงเหลือทุกกองทุน, ผู้บริจาคใหม่เดือนนี้, รายรับ-รายจ่าย 6 เดือนล่าสุด, งานที่ต้องดำเนินการ, การบริจาคล่าสุด
- ปุ่ม: ส่งออกสรุป, บันทึกการบริจาค, ดูรายงาน, สมัครสมาชิก, เข้าสู่ระบบ, ออกจากระบบ
- Audit (เน้น): "บันทึกทุกการกระทำสำคัญในระบบ — ใครทำอะไร เมื่อไร ... ข้อมูลนี้ลบไม่ได้"
- Validation: กรุณากรอกชื่อ-นามสกุล, กรุณากรอกอีเมล, รูปแบบอีเมลไม่ถูกต้อง, รหัสผ่านอย่างน้อย 6 ตัวอักษร, รหัสผ่านไม่ตรงกัน, กรุณายอมรับเงื่อนไขการใช้งาน, กรุณาตรวจสอบข้อมูล

> หมายเหตุ: ดีไซน์มี typo หลายจุด (เช่น "อออกจากระบบ", "ระบบอออกแบบ", "บทบาทแล้งสิทธิ์", "หัวข้อรองย", "คำนหา") — ตอน port ควรแก้เป็นสะกดถูก: ออกจากระบบ, ระบบออกแบบ, บทบาทและสิทธิ์, หัวข้อรอง, ค้นหา

---

## 6. การ map คอมโพเนนต์ → ไฟล์ในโค้ด (Component → file mapping)

> หลักการ: reuse 11 feature ที่มีอยู่แล้ว (`apps/web/src/features/*` แต่ละตัวมี `<name>-view.tsx` + `<name>.ts` + tests) สร้างใหม่เฉพาะ design-system, layout, auth, donors, platform, public

| คอมโพเนนต์ดีไซน์ | ไฟล์เป้าหมายใน `apps/web/src/` | สถานะ |
|---|---|---|
| Btn, Badge, Card, Money, Empty, Field, ErrorSummary, Toolbar, SearchBox, PageHead, KPI, Modal, Drawer, Toast | `design-system/*.tsx` (ใหม่) | สร้างใหม่ |
| MiniBars, ActivityCalendar, IncomeExpenseChart | `design-system/charts/*.tsx` (ใหม่) | สร้างใหม่ |
| icon set (36 ตัว) | `design-system/icons.tsx` (ใหม่) | สร้างใหม่ |
| RoleShell, Sidebar, Topbar, AdminApp(router) | `layout/role-shell.tsx`, `layout/sidebar.tsx`, `layout/topbar.tsx`, `app.tsx` (มีอยู่ — ขยาย) | layout ใหม่; ต่อกับ app.tsx |
| LoginScreen, RegisterForm, SocialButtons | `features/auth/login-view.tsx`, `features/auth/register-view.tsx`, `features/auth/auth.ts` (ใหม่) | สร้างใหม่ |
| Dashboard, KPI, TaskQueueList, DonationTable | `features/dashboard/dashboard-view.tsx` (มีอยู่) | reuse/ขยาย |
| DonationIntake, DonationTable, StatusBadge | `features/donations/donations-view.tsx` (มีอยู่) | reuse/ขยาย |
| DonorProfile | `features/donors/donors-view.tsx` + `donors.ts` (ใหม่ — ขาดทั้ง feature) | **สร้างใหม่** |
| AnumodanaDoc, ReceiptScreen, bahtText | `features/receipts/receipts-view.tsx` (มีอยู่) + `lib/baht-text.ts` | reuse/ขยาย |
| Ledger, LedgerEntryModal | `features/ledger/ledger-view.tsx` (มีอยู่) | reuse/ขยาย |
| EventBooking, EventModal, ActivityCalendar | `features/ceremonies/ceremonies-view.tsx` (มีอยู่) | reuse/ขยาย |
| People, PersonForm | `features/personnel/personnel-view.tsx` (มีอยู่) | reuse/ขยาย |
| Reports | `features/reports/reports-view.tsx` (มีอยู่) | reuse/ขยาย |
| Roles, UserModal | `features/users/users-view.tsx` (มีอยู่) | reuse/ขยาย |
| Audit (temple) | `features/audit/audit-view.tsx` (ใหม่) | **สร้างใหม่** (ไม่มี feature audit) |
| (Inventory — ไม่มีหน้าจอในดีไซน์ที่ถอดได้) | `features/inventory/inventory-view.tsx` (มีอยู่) | reuse; **ไม่พบดีไซน์** |
| (Temple profile — ไม่มีหน้าจอในดีไซน์ที่ถอดได้) | `features/temple/temple-view.tsx` (มีอยู่) | reuse; **ไม่พบดีไซน์** |
| (Attachments — ไม่มีหน้าจอในดีไซน์) | `features/attachments/attachments-view.tsx` (มีอยู่) | reuse; **ไม่พบดีไซน์** |
| InnoveraView (+ Users/Notifications/AuditLog) | `features/platform/*` (ใหม่) | **สร้างใหม่** |
| PublicView (Home/Booking/MyBookings/Donate/Calendar/Notifications/Profile) | `features/public/*` (ใหม่) | **สร้างใหม่** |
| DesignSystemScreen | `features/design-system/ds-screen.tsx` (ใหม่ — หน้า showcase) | สร้างใหม่ (optional) |

> `apps/web/src/control-tower.ts` = dev artifact, **ห้าม** นำเข้า UI หลัก

---

## 7. การต่อ API ต่อหน้าจอ (API wiring per screen)

อ้างอิง **BACKEND API ที่มีจริง** (ไม่ใช่ apiNeeds ในดีไซน์ ซึ่งเป็น path สมมติ)

| หน้าจอ | endpoint จริงที่ใช้ |
|---|---|
| LoginScreen | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| Platform Login | `POST /platform/auth/login`, `/refresh`, `/logout` |
| Dashboard | `GET /dashboard` |
| DonationIntake / DonationTable | `GET/POST /donations`, `GET/PATCH /donations/:id`, `POST /donations/:id/void` |
| DonorProfile | `GET/POST /donors`, `GET/PATCH /donors/:id` |
| ReceiptScreen / AnumodanaDoc | `GET/POST /receipts`, `GET /receipts/:id`, `GET /receipts/:id/preview`, `POST /receipts/:id/void`, `POST /receipts/:id/reissue` |
| Ledger / LedgerEntryModal | `GET /ledger/accounts`, `GET /ledger/summary`, `GET/POST /ledger/entries`, `GET /ledger/entries/:id`, `POST .../void`, `POST .../reconcile`, `POST /ledger/periods/close`, `GET /ledger/periods` |
| EventBooking / EventModal | `GET/POST /ceremonies`, `GET/PATCH /ceremonies/:id` |
| People / PersonForm | `GET/POST /personnel`, `GET/PATCH /personnel/:id` |
| Reports | `GET /reports/:type` (CSV/printable HTML เท่านั้น) |
| Roles / UserModal | `GET /users`, `GET /users/:id`, `POST /users`, `PATCH /users/:id` (admin only) |
| Audit (temple) | **ไม่มี endpoint** — backend ยังไม่มี `/audit` ของ tenant |
| Temple profile | `GET /temple`, `PATCH /temple` (มี backend, ไม่มีดีไซน์) |
| Inventory | `GET/POST /inventory/items`, `GET/PATCH /inventory/items/:id`, `.../movements` (มี backend, ไม่มีดีไซน์) |
| Attachments | `POST /attachments`, `GET /attachments`, `GET /attachments/:id/download`, `DELETE /attachments/:id` |
| InnoveraView - apps | `GET /platform/applications`, `POST .../:id/approve`, `/reject` |
| InnoveraView - temples | `GET /platform/temples`, `POST .../:id/suspend`, `/resume` |
| InnoveraView - users | `GET /platform/platform-users`, `POST .../:id/disable`/`enable`, `GET /platform/users` |
| InnoveraView - break-glass | `POST/GET /platform/break-glass`, `DELETE .../:id`, `GET .../:id/tenant-snapshot` |
| InnoveraView - notifications | **ไม่มี endpoint** |
| InnoveraView - audit | **ไม่มี endpoint** (platform audit) |
| PublicView (ทั้งหมด) | **ไม่มี `/public/*` endpoint ใดๆ** |

---

## 8. ตารางความพร้อมฝั่ง Backend (Backend readiness)

| หน้าจอ/ฟีเจอร์ | สถานะ | เหตุผล |
|---|---|---|
| Dashboard | implemented-api-ready | `GET /dashboard` มี + view มีอยู่ |
| Donations (intake/list/void) | implemented-api-ready | API ครบ + view มีอยู่ |
| Donors / DonorProfile | needs-api-adapter | API พร้อม (`/donors`) แต่ **ขาด view ทั้ง feature** |
| Receipts / AnumodanaDoc | implemented-api-ready | API ครบ (รวม preview/void/reissue) + view มีอยู่ |
| Ledger / reconcile / close period | implemented-api-ready | API ครบ + view มีอยู่ |
| Ceremonies / Events | implemented-api-ready | `/ceremonies` มี + view มีอยู่ |
| Personnel / People | implemented-api-ready | `/personnel` มี + view มีอยู่ |
| Users / Roles (tenant) | needs-api-adapter | `/users` มี (CRUD) แต่ **ไม่มี endpoint permission-matrix** — ตารางสิทธิ์ใน Roles ต้อง hardcode/derive ฝั่ง client |
| Temple profile | implemented-api-ready | `/temple` มี + view มีอยู่ (ไม่มีดีไซน์ที่ถอดได้) |
| Inventory | implemented-api-ready | `/inventory/*` มี + view มีอยู่ (ไม่มีดีไซน์) |
| Attachments | implemented-api-ready | `/attachments` มี + view มีอยู่ (ไม่มีดีไซน์) |
| Reports (CSV / HTML) | implemented-api-ready | `GET /reports/:type` (CSV + printable HTML) |
| Reports (binary PDF / Excel .xlsx) | future/out-of-scope | backend **ยังไม่มี** binary export — ดีไซน์เสนอ PDF/Excel แต่ต้องทำฝั่ง backend ก่อน |
| Audit log (tenant) | future/out-of-scope | **ไม่มี endpoint** `/audit` ของ tenant |
| LoginScreen | implemented-api-ready | `POST /auth/login` มี |
| RegisterForm (สมัครสมาชิก) | future/out-of-scope | **ไม่มี** `/auth/register` หรือ `/auth/register-temple` |
| Forgot/Reset password | future/out-of-scope | **ไม่มี** `/auth/forgot-password`; UserModal ส่ง "อีเมลตั้งรหัสผ่าน" ก็ยังไม่มี endpoint รองรับ |
| SocialButtons (OAuth) | future/out-of-scope | ไม่มี endpoint social/OAuth |
| Platform - applications | implemented-api-ready | `/platform/applications` + approve/reject |
| Platform - temples | implemented-api-ready | `/platform/temples` + suspend/resume |
| Platform - users | implemented-api-ready | `/platform/platform-users` + `/platform/users` |
| Platform - break-glass | implemented-api-ready | API มี (ดีไซน์ไม่ได้แสดงหน้าจอชัด — UI ต้องออกแบบเพิ่ม) |
| Platform - notifications | future/out-of-scope | ไม่มี endpoint notifications |
| Platform - audit | future/out-of-scope | ไม่มี endpoint platform-audit |
| Public portal (Home/Booking/Donate/Calendar/Notifications/Profile/MyBookings) | future/out-of-scope | **ไม่มี `/public/*` endpoint ใดๆ** — devotee portal ยังไม่ build ทั้งฝั่ง backend และ web |
| Design-system primitives + layout (RoleShell/Sidebar/Topbar) | needs-api-adapter | ไม่ต้องใช้ API; ขาดทั้งหมดฝั่ง web ต้องสร้างก่อนจึงจะประกอบ shell ได้ |

---

## 9. อ้างอิงแหล่งที่มา (Source references — `_bootstrap.html` line ranges)

| module | ช่วงบรรทัด (โดยประมาณ) | เนื้อหา |
|---|---|---|
| `icons.jsx` | 16–1034 | icon set 36 ตัว |
| `data.jsx` | 1335–2051 | entity: Donors 1374–1446, Funds 1449–1473, Donations 1476–1548, Ledger 1551–1661, Events 1664–1714, People 1717–1787, Roles 1790–1810, Perm matrix 1811–1881, Audit 1884–1962, Action meta 1968–2011, Ledger status 2013–2026, Monthly chart 2028–2051 |
| `shell.jsx` | 2052–3147 | Primitives, NAV 2669–2725, PAGE_TITLES 2726–2738, Sidebar 2739–2959, Topbar 2960–3100+ |
| `ds-screen.jsx` | 2065–4200 | Btn 2065, Badge 2094, Card 2118, Modal 2381, Drawer 2477, Toast 2588, Toolbar 2612, SearchBox 2624; DS swatches/typography/buttons/badges 3148–4200 |
| `screens-1.jsx` | 4502–7320 | Dashboard 4741, RegisterForm 14229*, LoginScreen 14600* (*อยู่ใน admin-app.jsx) |
| `screens-2.jsx` | 7321–9939 | AnumodanaDoc 1121(om-id)/~7321, ReceiptScreen ~7513, LedgerEntryModal ~7775, Ledger ~8055, EventBooking ~9024, EventModal ~9712 |
| `screens-3.jsx` | 9963–12982 | PersonForm 9963–10224, People 10226–10824, Reports 10826–11259, UserModal 11261–11542, Roles 11543–12569, Audit 12571–12982 |
| `role-extras.jsx` | 12983–14019 | CAL ~13001, ACT_KINDS ~13007, ACTIVITIES ~13029 (AC-01..AC-11), ActivityCalendar ~13118, MiniBars, NOTIF_KIND |
| `admin-app.jsx` | 14020–20343 | PAGE_PERM 14046–14057, ACCOUNTS 14059–14075, VIEWS 14076–14086, roleNameOf/permOf 14087–14101, SocialButtons/RegisterForm 14175–14228, LoginScreen 14600–15250, RoleShell 15278–15900, InnoveraView 15897–18000, PublicView 18108–20000, AdminApp 20033–20327 |
| admin-app-B (รายละเอียด platform/public) | 17200–20000 | Admin Users 17200–17684, Notifications 17685–17849, Audit 17850–17967, PublicView setup 17978–18161, Home 18174–18418, Activities 18579–18695, Booking 19002–19456, MyBookings 19460–19660, Donate 19661–19850, Profile 19851–20000 |

> ไฟล์อ้างอิงเพิ่มเติม: `docs/reviews/claude-design-function-inventory.md` (บรรทัด 28–155: workflow การบริจาค)

---

## 10. คำถามค้าง / อุปสรรค (Open questions & blockers)

1. **เมนูไม่ตรงกันหลายชุด** — ดีไซน์มี NAV อย่างน้อย 3 เวอร์ชัน (shell.jsx vs ds-screen.jsx vs screens-1/3.jsx). แนะนำยึด `shell.jsx` NAV (§2.1). ต้องยืนยันกับเจ้าของดีไซน์ว่าชุดอื่นเป็น legacy จริง

2. **No-hard-delete (Product Rule)** — ดีไซน์ใช้ icon `trash` แต่ระบุชัดว่า "used for void, not hard delete". สอดคล้องกับ backend (`/donations/:id/void`, `/ledger/entries/:id/void`, `/receipts/:id/void`). ตอน port ต้องไม่ผูก trash icon กับ DELETE — ใช้ void/cancel เท่านั้นสำหรับ donation/ledger/receipt

3. **เลขที่เอกสาร unique** — ดีไซน์มีคอลัมน์ "เลขที่" ใน donation/receipt/ledger แต่ไม่ได้ระบุ logic การ generate. ต้องให้ backend เป็นผู้ออกเลข (unique, ตรวจย้อนหลังได้) — UI แสดงผลอย่างเดียว

4. **Audit log ฝั่ง tenant ไม่มี endpoint** — ดีไซน์มีหน้า Audit (screens-3.jsx) และเน้น "ลบไม่ได้" (ตรงกับ Product Rule) แต่ backend ปัจจุบันไม่มี `/audit` ของ tenant — ต้องสร้าง endpoint ก่อนทำหน้านี้ทำงานจริง

5. **ตารางสิทธิ์ (permission matrix) ไม่มี endpoint** — Roles screen มี matrix none→ดู→แก้ไข→จัดการ แต่ backend มีแค่ CRUD `/users`. ต้องตัดสินใจว่า matrix เป็น static config หรือจะเพิ่ม endpoint `/permissions`

6. **RegisterForm / register-temple / forgot-password / OAuth** — ดีไซน์มี UI ครบ (สมัครสมาชิก, social login, ส่งอีเมลตั้งรหัสผ่านใน UserModal) แต่ backend **ไม่มี** endpoint เหล่านี้เลย — ต้องตัดออกจาก MVP หรือซ่อน UI จนกว่า backend พร้อม

7. **Public portal ทั้งหมดเป็น future** — ดีไซน์ PublicView ละเอียด (จอง/บริจาคออนไลน์/ปฏิทิน/แจ้งเตือน/โปรไฟล์) แต่ **ไม่มี `/public/*` endpoint** และ web ยังไม่มี feature นี้ — ต้องวางเป็น phase แยก

8. **Binary export (PDF/Excel)** — Reports ดีไซน์เสนอ PDF/Excel/CSV แต่ backend ให้ได้แค่ CSV + printable HTML — PDF/Excel เป็น future

9. **RLS / tenant isolation** — ดีไซน์ไม่ได้แสดง tenant switcher หรือ context การเลือกวัดสำหรับ staff (1 user = 1 วัด). ฝั่ง platform (`InnoveraView`) จัดการหลายวัดผ่าน `/platform/temples` + break-glass + tenant-snapshot — ต้องยืนยันว่า RLS isolation บังคับที่ backend และ UI platform ใช้ break-glass อย่างถูกต้อง (ดีไซน์ไม่ได้แสดงหน้าจอ break-glass ชัดเจน)

10. **Token hex ไม่ครบ** — สีหลัก 8 ตัวยืนยันได้ แต่ tint/border/ink-2/ink-3 ฯลฯ ใช้ผ่าน CSS var โดยไม่พบ hex ในข้อมูลที่ถอด — ต้องอ่าน CSS `:root` ใน `_bootstrap.html` โดยตรงตอน port

11. **Notifications (ทั้ง platform และ public)** — ดีไซน์มีหน้าแจ้งเตือนหลายที่ แต่ backend ไม่มี endpoint notifications — future ทั้งหมด

12. **Typo ในดีไซน์** — มีคำสะกดผิดหลายจุด (อออกจากระบบ, ระบบอออกแบบ, คำนหา, บทบาทแล้งสิทธิ์, หัวข้อรองย) — ต้องแก้ตอน port (ดู §5.10)

13. **Inventory / Temple profile / Attachments มี backend+view แต่ไม่มีดีไซน์** — ขัดกับ Core Modules ใน CLAUDE.md (คลังของบริจาค, ข้อมูลวัด). ต้องขอดีไซน์เพิ่ม หรือออกแบบ UI เองโดยยึด design-system primitives เดียวกัน
