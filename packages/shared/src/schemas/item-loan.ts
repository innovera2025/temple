/**
 * การยืม-คืนสิ่งของวัด (temple item borrowing/returning) — validation + types.
 * Dependency-free; shared by the NestJS item-loans module and the React UI.
 *
 * Money (cash compensation) is integer satang. A loan requires a borrow photo
 * (borrowPhotoId -> an uploaded attachment). On return, if returnedQty < quantity the
 * caller must provide a settlement (replacement = ซื้อมาชดใช้, or cash = จ่ายเงินแทน).
 * See docs/plans/item-loans-build-plan.md.
 */

import { isValidIsoDate } from "./donation";
import { type FieldError, type ValidationResult } from "./donor";
import { type InventoryCategory, type InventoryStatus, isInventoryCategory, isInventoryStatus } from "./inventory";

export const LOAN_STATUSES = ["borrowed", "returned"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const LOAN_SETTLEMENT_TYPES = ["replacement", "cash"] as const;
export type LoanSettlementType = (typeof LOAN_SETTLEMENT_TYPES)[number];

export const LOAN_STATUS_LABELS_TH: Record<LoanStatus, string> = {
  borrowed: "กำลังยืม",
  returned: "คืนแล้ว",
};

export const LOAN_SETTLEMENT_TYPE_LABELS_TH: Record<LoanSettlementType, string> = {
  replacement: "ซื้อมาชดใช้",
  cash: "จ่ายเป็นเงิน",
};

export const LOAN_LIMITS = {
  name: 200,
  unit: 40,
  borrowerName: 200,
  borrowerPhone: 40,
  note: 2000,
  returnNote: 500,
  replacementNote: 500,
} as const;

export const MAX_LOAN_QUANTITY = 1_000_000;
export const MAX_CASH_SATANG = 100_000_000_000; // ฿1,000,000,000 ceiling

export function isLoanStatus(value: unknown): value is LoanStatus {
  return typeof value === "string" && (LOAN_STATUSES as readonly string[]).includes(value);
}
export function isLoanSettlementType(value: unknown): value is LoanSettlementType {
  return typeof value === "string" && (LOAN_SETTLEMENT_TYPES as readonly string[]).includes(value);
}

/** Outstanding shortage when returning (never negative). */
export function loanShortage(quantity: number, returnedQty: number): number {
  return Math.max(0, quantity - returnedQty);
}

// ---- inputs ----------------------------------------------------------------

export interface BorrowableItemInput {
  name: string;
  category?: InventoryCategory;
  unit?: string | null;
  totalQty?: number;
  status?: InventoryStatus;
  note?: string | null;
}
export type CreateBorrowableItemInput = BorrowableItemInput;
export type UpdateBorrowableItemInput = Partial<BorrowableItemInput>;

export interface CreateLoanInput {
  itemId: string;
  borrowerName: string;
  borrowerPhone?: string | null;
  quantity: number;
  borrowedAt: string;
  dueAt?: string | null;
  /** Required: an uploaded attachment id (photo taken at borrow time). */
  borrowPhotoId: string;
  note?: string | null;
}

export interface LoanSettlementInput {
  settlementType: LoanSettlementType;
  /** integer satang; required when settlementType = "cash". */
  cashAmountSatang?: number;
  replacementNote?: string | null;
  note?: string | null;
}

export interface ReturnLoanInput {
  returnedQty: number;
  returnedAt: string;
  returnNote?: string | null;
  /** Required (by the API) when returnedQty < quantity. */
  settlement?: LoanSettlementInput;
}

export interface LoanSearchQuery {
  itemId?: string;
  status?: LoanStatus;
  q?: string;
}

// ---- views (API -> UI) -----------------------------------------------------

export interface BorrowableItemView {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string | null;
  totalQty: number;
  /** totalQty − outstanding borrowed (computed). */
  availableQty: number;
  status: InventoryStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoanSettlementView {
  id: string;
  shortageQty: number;
  settlementType: LoanSettlementType;
  cashAmountSatang: string | null;
  replacementNote: string | null;
  settledAt: string;
  note: string | null;
}

export interface ItemLoanView {
  id: string;
  loanNo: string;
  itemId: string;
  itemName: string;
  borrowerName: string;
  borrowerPhone: string | null;
  quantity: number;
  borrowedAt: string;
  dueAt: string | null;
  borrowPhotoId: string | null;
  status: LoanStatus;
  returnedAt: string | null;
  returnedQty: number | null;
  returnNote: string | null;
  shortageQty: number;
  settlement: LoanSettlementView | null;
  createdAt: string;
  updatedAt: string;
}

// ---- helpers ---------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optString(value: unknown, key: string, max: number, errors: FieldError[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string") {
    errors.push({ field: key, message: `${key} ไม่ถูกต้อง` });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({ field: key, message: `${key} ต้องไม่เกิน ${max} ตัวอักษร` });
    return undefined;
  }
  return trimmed;
}

function optInt(value: unknown, key: string, min: number, max: number, errors: FieldError[]): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    errors.push({ field: key, message: `${key} ต้องเป็นจำนวนเต็มระหว่าง ${min}–${max}` });
    return undefined;
  }
  return value;
}

// ---- validators ------------------------------------------------------------

const ITEM_KEYS = ["name", "category", "unit", "totalQty", "status", "note"] as const;

function buildItemFields(input: Record<string, unknown>, data: Record<string, unknown>, errors: FieldError[]): void {
  if ("category" in input) {
    if (isInventoryCategory(input.category)) data.category = input.category;
    else errors.push({ field: "category", message: "ประเภทไม่ถูกต้อง" });
  }
  if ("status" in input) {
    if (isInventoryStatus(input.status)) data.status = input.status;
    else errors.push({ field: "status", message: "สถานะไม่ถูกต้อง" });
  }
  if ("unit" in input) {
    const v = optString(input.unit, "unit", LOAN_LIMITS.unit, errors);
    if (v !== undefined) data.unit = v;
  }
  if ("note" in input) {
    const v = optString(input.note, "note", LOAN_LIMITS.note, errors);
    if (v !== undefined) data.note = v;
  }
  if ("totalQty" in input) {
    const v = optInt(input.totalQty, "totalQty", 0, MAX_LOAN_QUANTITY, errors);
    if (v !== undefined) data.totalQty = v;
  }
}

export function validateCreateBorrowableItem(input: unknown): ValidationResult<CreateBorrowableItemInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};
  if (typeof input.name !== "string" || input.name.trim() === "") {
    errors.push({ field: "name", message: "ต้องระบุชื่อสิ่งของ" });
  } else if (input.name.trim().length > LOAN_LIMITS.name) {
    errors.push({ field: "name", message: `ชื่อสิ่งของต้องไม่เกิน ${LOAN_LIMITS.name} ตัวอักษร` });
  } else {
    data.name = input.name.trim();
  }
  buildItemFields(input, data, errors);
  for (const key of Object.keys(input)) {
    if (!(ITEM_KEYS as readonly string[]).includes(key)) errors.push({ field: key, message: `ไม่รองรับฟิลด์ "${key}"` });
  }
  return errors.length ? { success: false, errors } : { success: true, data: data as unknown as CreateBorrowableItemInput };
}

export function validateUpdateBorrowableItem(input: unknown): ValidationResult<UpdateBorrowableItemInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};
  if ("name" in input) {
    if (typeof input.name !== "string" || input.name.trim() === "") errors.push({ field: "name", message: "ชื่อสิ่งของไม่ถูกต้อง" });
    else if (input.name.trim().length > LOAN_LIMITS.name) errors.push({ field: "name", message: `ชื่อสิ่งของต้องไม่เกิน ${LOAN_LIMITS.name} ตัวอักษร` });
    else data.name = input.name.trim();
  }
  buildItemFields(input, data, errors);
  for (const key of Object.keys(input)) {
    if (!(ITEM_KEYS as readonly string[]).includes(key)) errors.push({ field: key, message: `ไม่รองรับฟิลด์ "${key}"` });
  }
  if (Object.keys(data).length === 0 && errors.length === 0) errors.push({ field: "_root", message: "ไม่มีข้อมูลที่จะแก้ไข" });
  return errors.length ? { success: false, errors } : { success: true, data: data as UpdateBorrowableItemInput };
}

export function validateCreateLoan(input: unknown): ValidationResult<CreateLoanInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};

  if (typeof input.itemId !== "string" || input.itemId.trim() === "") errors.push({ field: "itemId", message: "ต้องเลือกสิ่งของ" });
  else data.itemId = input.itemId.trim();

  if (typeof input.borrowerName !== "string" || input.borrowerName.trim() === "") errors.push({ field: "borrowerName", message: "ต้องระบุชื่อผู้ยืม" });
  else if (input.borrowerName.trim().length > LOAN_LIMITS.borrowerName) errors.push({ field: "borrowerName", message: `ชื่อผู้ยืมต้องไม่เกิน ${LOAN_LIMITS.borrowerName} ตัวอักษร` });
  else data.borrowerName = input.borrowerName.trim();

  if (typeof input.quantity !== "number" || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_LOAN_QUANTITY) {
    errors.push({ field: "quantity", message: "จำนวนที่ยืมต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป" });
  } else data.quantity = input.quantity;

  if (typeof input.borrowedAt !== "string" || !isValidIsoDate(input.borrowedAt.trim())) errors.push({ field: "borrowedAt", message: "วันที่ยืมไม่ถูกต้อง (YYYY-MM-DD)" });
  else data.borrowedAt = input.borrowedAt.trim();

  if ("dueAt" in input && input.dueAt !== undefined && input.dueAt !== null && input.dueAt !== "") {
    if (typeof input.dueAt !== "string" || !isValidIsoDate(input.dueAt.trim())) errors.push({ field: "dueAt", message: "กำหนดคืนไม่ถูกต้อง (YYYY-MM-DD)" });
    else data.dueAt = input.dueAt.trim();
  }

  // Photo required at borrow time.
  if (typeof input.borrowPhotoId !== "string" || input.borrowPhotoId.trim() === "") errors.push({ field: "borrowPhotoId", message: "ต้องแนบรูปถ่ายตอนยืมก่อนบันทึก" });
  else data.borrowPhotoId = input.borrowPhotoId.trim();

  const phone = optString(input.borrowerPhone, "borrowerPhone", LOAN_LIMITS.borrowerPhone, errors);
  if (phone !== undefined) data.borrowerPhone = phone;
  const note = optString(input.note, "note", LOAN_LIMITS.note, errors);
  if (note !== undefined) data.note = note;

  return errors.length ? { success: false, errors } : { success: true, data: data as unknown as CreateLoanInput };
}

function validateSettlement(raw: unknown, errors: FieldError[]): LoanSettlementInput | undefined {
  if (!isPlainObject(raw)) {
    errors.push({ field: "settlement", message: "ข้อมูลการชดใช้ไม่ถูกต้อง" });
    return undefined;
  }
  const out: Record<string, unknown> = {};
  if (!isLoanSettlementType(raw.settlementType)) {
    errors.push({ field: "settlement.settlementType", message: "ต้องเลือกวิธีชดใช้ (ซื้อมาคืน/จ่ายเงิน)" });
  } else {
    out.settlementType = raw.settlementType;
    if (raw.settlementType === "cash") {
      const amt = raw.cashAmountSatang;
      if (typeof amt !== "number" || !Number.isInteger(amt) || amt < 1 || amt > MAX_CASH_SATANG) {
        errors.push({ field: "settlement.cashAmountSatang", message: "จำนวนเงินชดใช้ไม่ถูกต้อง" });
      } else out.cashAmountSatang = amt;
    } else {
      const rn = optString(raw.replacementNote, "settlement.replacementNote", LOAN_LIMITS.replacementNote, errors);
      if (rn !== undefined) out.replacementNote = rn;
    }
  }
  const note = optString(raw.note, "settlement.note", LOAN_LIMITS.note, errors);
  if (note !== undefined) out.note = note;
  return out as unknown as LoanSettlementInput;
}

export function validateReturnLoan(input: unknown): ValidationResult<ReturnLoanInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};

  if (typeof input.returnedQty !== "number" || !Number.isInteger(input.returnedQty) || input.returnedQty < 0 || input.returnedQty > MAX_LOAN_QUANTITY) {
    errors.push({ field: "returnedQty", message: "จำนวนที่คืนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" });
  } else data.returnedQty = input.returnedQty;

  if (typeof input.returnedAt !== "string" || !isValidIsoDate(input.returnedAt.trim())) errors.push({ field: "returnedAt", message: "วันที่คืนไม่ถูกต้อง (YYYY-MM-DD)" });
  else data.returnedAt = input.returnedAt.trim();

  const rn = optString(input.returnNote, "returnNote", LOAN_LIMITS.returnNote, errors);
  if (rn !== undefined) data.returnNote = rn;

  if ("settlement" in input && input.settlement !== undefined && input.settlement !== null) {
    const settlement = validateSettlement(input.settlement, errors);
    if (settlement !== undefined) data.settlement = settlement;
  }

  return errors.length ? { success: false, errors } : { success: true, data: data as unknown as ReturnLoanInput };
}
