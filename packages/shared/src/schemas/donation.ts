/**
 * Donation validation + types (Task 5).
 *
 * Single source of truth for donation field rules, shared by the NestJS API
 * (request validation + 422 errors) and the React web app (form/list/filters).
 * Dependency-free, mirroring the donor schema, so it can be consumed from any
 * package without pulling in a validation library.
 *
 * Money is integer **satang** end-to-end (`amountSatang`). Baht is only a
 * presentation/input concern — convert with `bahtToSatang` / `satangToBaht`.
 */

import type { FieldError, ValidationResult } from "./donor";

export const DONATION_METHODS = ["cash", "bank_transfer", "qr", "other"] as const;
export type DonationMethod = (typeof DONATION_METHODS)[number];

/** Thai labels for payment methods (D1). */
export const DONATION_METHOD_LABELS_TH: Record<DonationMethod, string> = {
  cash: "เงินสด",
  bank_transfer: "โอนเงิน",
  qr: "QR",
  other: "อื่น ๆ",
};

export const DONATION_STATUSES = ["pledged", "confirmed", "cancelled"] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];

export const DONATION_STATUS_LABELS_TH: Record<DonationStatus, string> = {
  pledged: "ตั้งใจบริจาค",
  confirmed: "ยืนยันแล้ว",
  cancelled: "ยกเลิกแล้ว",
};

export const DONATION_LIMITS = {
  note: 2000,
  reason: 500,
  /** ~90 billion baht; stays well inside Number.MAX_SAFE_INTEGER for satang math. */
  maxAmountSatang: 9_000_000_000_000,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real `YYYY-MM-DD` calendar date. The format regex alone is not
 * enough: `2026-13-40` (out of range) or `2026-02-31` (rolls over to Mar 3) both
 * match the shape but are not valid days, so we round-trip through UTC and verify.
 */
export function isValidIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export interface CreateDonationInput {
  amountSatang: number;
  method: DonationMethod;
  /** ISO calendar date, `YYYY-MM-DD`. */
  donationDate: string;
  donorId?: string | null;
  fundAccountId?: string | null;
  note?: string | null;
}

/** Edit scope (D6): correct amount/date/method/note/donor/fund on a confirmed donation. */
export interface UpdateDonationInput {
  amountSatang?: number;
  method?: DonationMethod;
  donationDate?: string;
  donorId?: string | null;
  fundAccountId?: string | null;
  note?: string | null;
}

export interface VoidDonationInput {
  reason: string;
}

export interface DonationSearchQuery {
  donorId?: string;
  method?: DonationMethod;
  status?: DonationStatus;
  /** Inclusive lower/upper bounds on donationDate, `YYYY-MM-DD`. */
  dateFrom?: string;
  dateTo?: string;
  take?: number;
  skip?: number;
}

// ---------------------------------------------------------------------------
// Money helpers (baht <-> integer satang). Never use floats to *store* money;
// these are only for converting human baht input and formatting for display.
// ---------------------------------------------------------------------------

/** Convert a baht amount (possibly fractional, e.g. 100.5) to integer satang. */
export function bahtToSatang(baht: number): number {
  return Math.round(baht * 100);
}

/** Convert integer satang to a baht number (for inputs/calculations, not storage). */
export function satangToBaht(satang: number | bigint): number {
  return Number(satang) / 100;
}

/** Format integer satang as a grouped baht string, e.g. 100050 -> "1,000.50". */
export function formatSatang(satang: number | bigint): string {
  const value = Number(satang);
  const negative = value < 0;
  const abs = Math.abs(value);
  const baht = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = baht.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${negative ? "-" : ""}${grouped}.${cents.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateAmountSatang(value: unknown, errors: FieldError[]): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ field: "amountSatang", message: "กรุณาระบุจำนวนเงิน (สตางค์)" });
    return undefined;
  }
  if (!Number.isInteger(value)) {
    errors.push({ field: "amountSatang", message: "จำนวนเงิน (สตางค์) ต้องเป็นจำนวนเต็ม" });
    return undefined;
  }
  if (value <= 0) {
    errors.push({ field: "amountSatang", message: "จำนวนเงินต้องมากกว่า 0" });
    return undefined;
  }
  if (value > DONATION_LIMITS.maxAmountSatang) {
    errors.push({ field: "amountSatang", message: "จำนวนเงินเกินกว่าที่ระบบรองรับ" });
    return undefined;
  }
  return value;
}

function validateMethod(value: unknown, errors: FieldError[]): DonationMethod | undefined {
  if (typeof value !== "string" || !DONATION_METHODS.includes(value as DonationMethod)) {
    errors.push({ field: "method", message: "ช่องทางการบริจาคไม่ถูกต้อง" });
    return undefined;
  }
  return value as DonationMethod;
}

function validateDonationDate(value: unknown, errors: FieldError[]): string | undefined {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    errors.push({ field: "donationDate", message: "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)" });
    return undefined;
  }
  if (!isValidIsoDate(value)) {
    errors.push({ field: "donationDate", message: "วันที่ไม่ถูกต้อง" });
    return undefined;
  }
  return value;
}

/** Returns `null` when explicitly cleared, the trimmed uuid when valid, or
 *  `undefined` when absent or invalid (an error is pushed when invalid). */
function validateOptionalUuid(
  value: unknown,
  field: string,
  errors: FieldError[],
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    errors.push({ field, message: "รหัสอ้างอิงไม่ถูกต้อง" });
    return undefined;
  }
  return value;
}

function validateNote(value: unknown, errors: FieldError[]): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    errors.push({ field: "note", message: "หมายเหตุต้องเป็นข้อความ" });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > DONATION_LIMITS.note) {
    errors.push({ field: "note", message: `หมายเหตุยาวเกิน ${DONATION_LIMITS.note} ตัวอักษร` });
    return undefined;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Public validators
// ---------------------------------------------------------------------------

export function validateCreateDonation(input: unknown): ValidationResult<CreateDonationInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "body", message: "ข้อมูลไม่ถูกต้อง" }] };
  }

  const errors: FieldError[] = [];
  const amountSatang = validateAmountSatang(input.amountSatang, errors);
  const method = validateMethod(input.method, errors);
  const donationDate = validateDonationDate(input.donationDate, errors);
  const donorId = validateOptionalUuid(input.donorId, "donorId", errors);
  const fundAccountId = validateOptionalUuid(input.fundAccountId, "fundAccountId", errors);
  const note = validateNote(input.note, errors);

  if (errors.length > 0 || amountSatang === undefined || method === undefined || donationDate === undefined) {
    return { success: false, errors };
  }

  const data: CreateDonationInput = { amountSatang, method, donationDate };
  if (donorId !== undefined) {
    data.donorId = donorId;
  }
  if (fundAccountId !== undefined) {
    data.fundAccountId = fundAccountId;
  }
  if (note !== undefined) {
    data.note = note;
  }

  return { success: true, data };
}

export function validateUpdateDonation(input: unknown): ValidationResult<UpdateDonationInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "body", message: "ข้อมูลไม่ถูกต้อง" }] };
  }

  const errors: FieldError[] = [];
  const data: UpdateDonationInput = {};

  if (input.amountSatang !== undefined) {
    const value = validateAmountSatang(input.amountSatang, errors);
    if (value !== undefined) {
      data.amountSatang = value;
    }
  }
  if (input.method !== undefined) {
    const value = validateMethod(input.method, errors);
    if (value !== undefined) {
      data.method = value;
    }
  }
  if (input.donationDate !== undefined) {
    const value = validateDonationDate(input.donationDate, errors);
    if (value !== undefined) {
      data.donationDate = value;
    }
  }
  if (input.donorId !== undefined) {
    const value = validateOptionalUuid(input.donorId, "donorId", errors);
    if (value !== undefined) {
      data.donorId = value;
    }
  }
  if (input.fundAccountId !== undefined) {
    const value = validateOptionalUuid(input.fundAccountId, "fundAccountId", errors);
    if (value !== undefined) {
      data.fundAccountId = value;
    }
  }
  if (input.note !== undefined) {
    const value = validateNote(input.note, errors);
    if (value !== undefined) {
      data.note = value;
    }
  }

  if (Object.keys(data).length === 0 && errors.length === 0) {
    errors.push({ field: "body", message: "ไม่มีข้อมูลให้แก้ไข" });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data };
}

export function validateVoidDonation(input: unknown): ValidationResult<VoidDonationInput> {
  const reason =
    isPlainObject(input) && typeof input.reason === "string" ? input.reason.trim() : "";

  if (reason.length === 0) {
    return { success: false, errors: [{ field: "reason", message: "กรุณาระบุเหตุผลในการยกเลิก" }] };
  }
  if (reason.length > DONATION_LIMITS.reason) {
    return {
      success: false,
      errors: [{ field: "reason", message: `เหตุผลยาวเกิน ${DONATION_LIMITS.reason} ตัวอักษร` }],
    };
  }

  return { success: true, data: { reason } };
}

/** Coerce raw (string-valued) query params into a typed donation search query. */
export function parseDonationSearchQuery(
  raw: Record<string, unknown> | undefined,
): DonationSearchQuery {
  const query: DonationSearchQuery = {};
  if (!raw) {
    return query;
  }

  if (typeof raw.donorId === "string" && UUID_RE.test(raw.donorId)) {
    query.donorId = raw.donorId;
  }
  if (typeof raw.method === "string" && DONATION_METHODS.includes(raw.method as DonationMethod)) {
    query.method = raw.method as DonationMethod;
  }
  if (typeof raw.status === "string" && DONATION_STATUSES.includes(raw.status as DonationStatus)) {
    query.status = raw.status as DonationStatus;
  }
  if (typeof raw.dateFrom === "string" && isValidIsoDate(raw.dateFrom)) {
    query.dateFrom = raw.dateFrom;
  }
  if (typeof raw.dateTo === "string" && isValidIsoDate(raw.dateTo)) {
    query.dateTo = raw.dateTo;
  }

  const take = Number(raw.take);
  if (Number.isFinite(take) && take > 0) {
    query.take = Math.min(Math.floor(take), 200);
  }
  const skip = Number(raw.skip);
  if (Number.isFinite(skip) && skip >= 0) {
    query.skip = Math.floor(skip);
  }

  return query;
}
