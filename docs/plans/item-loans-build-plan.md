# การยืม-คืนสิ่งของวัด (Temple item borrowing/returning) — Build Plan

> Source: user request (2026-06-02). New full-stack module. Follows the project rules
> (Thai-first, validation + permission + audit on every action, no hard delete for records,
> unique traceable doc numbers for money, RLS tenant isolation). Built DB → shared → API
> (+tests) → web, one slice per commit.

## ความต้องการ (from the user)
1. วัดเพิ่ม "สิ่งของที่ให้ยืมได้" ของวัดได้ และระบบ **แสดงจำนวนที่ยืมได้** (คงเหลือ).
2. แสดงข้อมูลการยืม — **ใครยืมบ้าง** กี่ชิ้น เมื่อไร สถานะ.
3. การยืม **ต้องถ่ายรูปก่อน** (แนบรูปตอนยืม) จึงจะบันทึกได้.
4. การคืน — ระบุได้ว่า **ส่งไม่ครบ**; กรณีไม่ครบ ให้ **ซื้อของมาชดใช้** หรือ **จ่ายเป็นเงินแทน** ได้.
5. **เก็บข้อมูลทั้งหมด** (ยืม/คืน/รูป/การชดใช้) ตรวจสอบย้อนหลังได้.

## Acceptance criteria
- เพิ่ม/แก้ไขสิ่งของยืมได้ (ชื่อ, หมวด, หน่วย, จำนวนทั้งหมด `totalQty`). ไม่มี hard delete — ปิดใช้งานด้วย `status=inactive`.
- `availableQty = totalQty − Σ(quantity − returnedQty ของ loan ที่ status=borrowed)` คำนวณฝั่ง API; ยืมเกินจำนวนคงเหลือ → 422.
- สร้างการยืม: ต้องมี `borrowPhotoId` (Attachment ownerType=`item_loan`) ที่อัปโหลดไว้ก่อน มิฉะนั้น → 422 ("ต้องแนบรูปก่อนยืม"). ออกเลขที่ `LOAN-NNNNNN` (doc_counters, atomic). audit `item_loan:create`.
- ดูรายการยืม: list + filter (item, status, ค้นหาผู้ยืม); แต่ละ loan แสดงผู้ยืม/จำนวน/วันที่/สถานะ/รูป.
- คืน: ระบุ `returnedQty` (≤ quantity). ถ้า `returnedQty < quantity` (ส่งไม่ครบ) ต้องมี **settlement**:
  - `replacement` (ซื้อมาชดใช้) + `replacementNote`, หรือ
  - `cash` (จ่ายเงินแทน) + `cashAmountSatang` (เก็บเป็นสตางค์).
  ปิด loan → `status=returned`, set `returnedAt/returnedQty/returnNote`. audit `item_loan:return` (+ `item_loan:settle` ถ้ามีการชดใช้). atomic (loan update + settlement insert + คืนจำนวนเข้า available).
- ทุก action: validation + permission (write = admin/finance/staff ตามสิทธิ์ inventory-class; read = ทุก role ในวัด) + audit + RLS isolation + tests.

## Data model (DB)
**Enums (new):**
- `LoanStatus { borrowed, returned }` — `borrowed` = ค้างคืน, `returned` = ปิดแล้ว (คืนครบ หรือคืนไม่ครบ+ชดใช้).
- `LoanSettlementType { replacement, cash }`.
- `AttachmentOwnerType` += `item_loan` (รูปตอนยืม/คืน).

**Tables (new, all tenant-scoped + RLS forced, wat_app = SELECT/INSERT/UPDATE only — no DELETE):**
- `borrowable_items` (BorrowableItem): id, tenant_id, name, category (reuse `InventoryCategory`), unit?, `total_qty`, status (reuse `InventoryStatus`), note, timestamps. `@@unique([tenantId,id])`.
- `item_loans` (ItemLoan): id, tenant_id, `loan_no` (unique/tenant), item_id (FK → borrowable_items by [tenant,id]), borrower_name, borrower_phone?, quantity, borrowed_at (date), due_at? (date), `borrow_photo_id`? (uuid → attachment), status, returned_at?, returned_qty?, return_note?, note, timestamps. indexes [tenant], [tenant,item], [tenant,status]; `@@unique([tenantId,id])` (for FK from settlements).
- `item_loan_settlements` (ItemLoanSettlement): id, tenant_id, loan_id (FK → item_loans by [tenant,id]), shortage_qty, settlement_type, cash_amount_satang? (BigInt), replacement_note?, settled_at (date), note, created_at. indexes [tenant], [tenant,loan].

Money is integer **satang** (BigInt) per project convention; serialized to string in JSON.

## Build slices (one commit each)
1. **DB** — prisma models + migration (tables + RLS + grants) + reseed + `rls:check`.  ← this commit
2. **shared** — `schemas/item-loan.ts`: enums/labels (Thai), `CreateItemInput`, `CreateLoanInput`, `ReturnLoanInput` (+ settlement), validators, views; export + tests.
3. **API** — `item-loans` module: items CRUD + availableQty, loans create (photo-required, doc-number, over-borrow guard), return (+settlement, atomic, lock), list/get; RBAC + audit + tests (RLS isolation, over-borrow 422, photo-required 422, short-return settlement, doc-number concurrency).
4. **web** — design-backed page (items list + add, loans list "ใครยืมบ้าง", borrow form w/ photo upload, return w/ shortage→settlement), wired to the API, Thai states; tests. Surface in nav (EXTRA_NAV) like inventory.

## Product decisions (defaults chosen — change if needed)
- **D1 — เงินชดใช้ไม่โพสต์เข้าบัญชี (ledger) อัตโนมัติใน v1.** บันทึก `cashAmountSatang` ในตาราง settlement (เก็บข้อมูล/audit ครบ) แต่ยังไม่สร้าง ledger income entry — แยก module เพื่อความปลอดภัย; การโพสต์เข้าบัญชีเป็น follow-up. (ทางเลือก: โพสต์เป็นรายรับ "ค่าชดใช้ของยืม" อัตโนมัติ.)
- **D2 — รูปบังคับตอนยืม.** loan create ต้องอ้าง `borrowPhotoId` ที่อัปโหลดผ่าน /attachments (ownerType=item_loan) มาก่อน. (ทางเลือก: อนุญาตยืมโดยไม่มีรูปแต่เตือน.)
- **D3 — แยกจาก inventory เดิม.** `borrowable_items` แยกจาก `inventory_items` (ของบริจาค/พัสดุ) เพราะ semantics ต่างกัน (สินทรัพย์ให้ยืม vs ของรับบริจาค).
