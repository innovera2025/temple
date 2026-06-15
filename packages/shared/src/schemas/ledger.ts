/**
 * Ledger income/expense validation + types (Task 7).
 *
 * Single source of truth for manual ledger-entry rules, shared by the NestJS API
 * (request validation + 422 errors) and the React web app (form/list/summary).
 * Dependency-free, mirroring the donation/receipt schemas.
 *
 * Money is integer **satang** end-to-end (`amountSatang`). A manual entry's
 * direction (income vs expense) is NOT stored separately — it is derived from the
 * account it posts to: a `revenue` account is income, an `expense` account is
 * expense (see {@link directionForAccountType}). The monthly summary counts only
 * `posted` entries; `voided` ones never count.
 */

import { isValidIsoDate } from "./donation";
import type { FieldError, ValidationResult } from "./donor";

export const LEDGER_ENTRY_STATUSES = ["draft", "posted", "voided"] as const;
export type LedgerEntryStatus = (typeof LEDGER_ENTRY_STATUSES)[number];

export const LEDGER_ENTRY_STATUS_LABELS_TH: Record<LedgerEntryStatus, string> = {
  draft: "ฉบับร่าง",
  posted: "บันทึกแล้ว",
  voided: "ยกเลิกแล้ว",
};

export const LEDGER_ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export const LEDGER_ACCOUNT_TYPE_LABELS_TH: Record<LedgerAccountType, string> = {
  asset: "สินทรัพย์",
  liability: "หนี้สิน",
  equity: "ส่วนทุน",
  revenue: "รายรับ",
  expense: "รายจ่าย",
};

/** A posted entry is income or expense depending on the account it posts to. */
export const LEDGER_DIRECTIONS = ["income", "expense"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const LEDGER_DIRECTION_LABELS_TH: Record<LedgerDirection, string> = {
  income: "รายรับ",
  expense: "รายจ่าย",
};

/**
 * Map an account type to a ledger direction. Only `revenue`/`expense` accounts
 * carry a direction (and may receive manual entries); the balance-sheet types
 * (asset/liability/equity) return `null` and are rejected for manual entries.
 */
export function directionForAccountType(accountType: string): LedgerDirection | null {
  if (accountType === "revenue") {
    return "income";
  }
  if (accountType === "expense") {
    return "expense";
  }
  return null;
}

export const LEDGER_LIMITS = {
  note: 2000,
  payee: 200,
  reason: 500,
  /** ~90 billion baht; stays well inside Number.MAX_SAFE_INTEGER for satang math. */
  maxAmountSatang: 9_000_000_000_000,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface CreateLedgerEntryInput {
  accountId: string;
  amountSatang: number;
  /** ISO calendar date, `YYYY-MM-DD`. */
  entryDate: string;
  payee?: string | null;
  note?: string | null;
}

export interface VoidLedgerEntryInput {
  reason: string;
}

export interface LedgerEntrySearchQuery {
  accountId?: string;
  status?: LedgerEntryStatus;
  direction?: LedgerDirection;
  donationId?: string;
  /** Inclusive lower/upper bounds on entryDate, `YYYY-MM-DD`. */
  dateFrom?: string;
  dateTo?: string;
  take?: number;
  skip?: number;
}

export interface LedgerSummaryQuery {
  /** `YYYY-MM`; when present, overrides dateFrom/dateTo with that month's range. */
  month?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** A ledger entry as returned by the API (money fields are integer-satang strings). */
export interface LedgerEntryView {
  id: string;
  entryNo: string;
  accountId: string;
  accountCode: string;
  accountNameTh: string;
  accountType: LedgerAccountType;
  direction: LedgerDirection | null;
  amountSatang: string;
  entryDate: string;
  status: LedgerEntryStatus;
  payee: string | null;
  description: string | null;
  reconciledAt: string | null;
  donationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerAccountView {
  id: string;
  code: string;
  nameTh: string;
  accountType: LedgerAccountType;
  direction: LedgerDirection | null;
  isActive: boolean;
}

/** Monthly (or ranged) income/expense rollup; money fields are integer-satang strings. */
export interface LedgerSummaryView {
  dateFrom: string;
  dateTo: string;
  incomeSatang: string;
  expenseSatang: string;
  /** income − expense; may be negative. */
  balanceSatang: string;
  incomeCount: number;
  expenseCount: number;
}

// ---------------------------------------------------------------------------
// Month helpers
// ---------------------------------------------------------------------------

export function isValidMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

/** First and last calendar day (`YYYY-MM-DD`) of a `YYYY-MM` month. */
export function monthRange(month: string): { dateFrom: string; dateTo: string } {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)); // 1-12
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const mm = String(monthIndex).padStart(2, "0");

  return {
    dateFrom: `${month.slice(0, 4)}-${mm}-01`,
    dateTo: `${month.slice(0, 4)}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Thailand civil time is UTC+7 with no DST. Date boundaries (which month / which
 * day "today" is) must be computed in ICT, not UTC, or anything that runs in the
 * 17:00–24:00 UTC window (= 00:00–07:00 next-day ICT) lands in the wrong day.
 */
export const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The `YYYY-MM` Thai civil month for an instant. */
export function ictMonth(now: Date): string {
  return new Date(now.getTime() + ICT_OFFSET_MS).toISOString().slice(0, 7);
}

/** The `YYYY-MM-DD` Thai civil date for an instant. */
export function ictDateIso(now: Date): string {
  return new Date(now.getTime() + ICT_OFFSET_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateUuid(value: unknown, field: string, errors: FieldError[]): string | undefined {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    errors.push({ field, message: "รหัสอ้างอิงไม่ถูกต้อง" });
    return undefined;
  }
  return value;
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
  if (value > LEDGER_LIMITS.maxAmountSatang) {
    errors.push({ field: "amountSatang", message: "จำนวนเงินเกินกว่าที่ระบบรองรับ" });
    return undefined;
  }
  return value;
}

function validateEntryDate(value: unknown, errors: FieldError[]): string | undefined {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    errors.push({ field: "entryDate", message: "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)" });
    return undefined;
  }
  if (!isValidIsoDate(value)) {
    errors.push({ field: "entryDate", message: "วันที่ไม่ถูกต้อง" });
    return undefined;
  }
  return value;
}

/**
 * Trimmed short text (payee/note). Mirrors the donation note validator: absent
 * (`undefined`) stays undefined so the caller leaves it unset; an explicit null
 * or a blank string becomes null ("cleared"); invalid input pushes an error.
 */
function validateShortText(
  value: unknown,
  field: string,
  max: number,
  errors: FieldError[],
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    errors.push({ field, message: "ต้องเป็นข้อความ" });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > max) {
    errors.push({ field, message: `ข้อความยาวเกิน ${max} ตัวอักษร` });
    return undefined;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Public validators
// ---------------------------------------------------------------------------

export function validateCreateLedgerEntry(
  input: unknown,
): ValidationResult<CreateLedgerEntryInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "body", message: "ข้อมูลไม่ถูกต้อง" }] };
  }

  const errors: FieldError[] = [];
  const accountId = validateUuid(input.accountId, "accountId", errors);
  const amountSatang = validateAmountSatang(input.amountSatang, errors);
  const entryDate = validateEntryDate(input.entryDate, errors);
  const payee = validateShortText(input.payee, "payee", LEDGER_LIMITS.payee, errors);
  const note = validateShortText(input.note, "note", LEDGER_LIMITS.note, errors);

  if (
    errors.length > 0 ||
    accountId === undefined ||
    amountSatang === undefined ||
    entryDate === undefined
  ) {
    return { success: false, errors };
  }

  const data: CreateLedgerEntryInput = { accountId, amountSatang, entryDate };
  if (payee !== undefined) {
    data.payee = payee;
  }
  if (note !== undefined) {
    data.note = note;
  }

  return { success: true, data };
}

export function validateVoidLedgerEntry(input: unknown): ValidationResult<VoidLedgerEntryInput> {
  const reason =
    isPlainObject(input) && typeof input.reason === "string" ? input.reason.trim() : "";

  if (reason.length === 0) {
    return { success: false, errors: [{ field: "reason", message: "กรุณาระบุเหตุผลในการยกเลิก" }] };
  }
  if (reason.length > LEDGER_LIMITS.reason) {
    return {
      success: false,
      errors: [{ field: "reason", message: `เหตุผลยาวเกิน ${LEDGER_LIMITS.reason} ตัวอักษร` }],
    };
  }

  return { success: true, data: { reason } };
}

/** Coerce raw (string-valued) query params into a typed ledger-entry search query. */
export function parseLedgerEntrySearchQuery(
  raw: Record<string, unknown> | undefined,
): LedgerEntrySearchQuery {
  const query: LedgerEntrySearchQuery = {};
  if (!raw) {
    return query;
  }

  if (typeof raw.accountId === "string" && UUID_RE.test(raw.accountId)) {
    query.accountId = raw.accountId;
  }
  if (
    typeof raw.status === "string" &&
    (LEDGER_ENTRY_STATUSES as readonly string[]).includes(raw.status)
  ) {
    query.status = raw.status as LedgerEntryStatus;
  }
  if (
    typeof raw.direction === "string" &&
    (LEDGER_DIRECTIONS as readonly string[]).includes(raw.direction)
  ) {
    query.direction = raw.direction as LedgerDirection;
  }
  if (typeof raw.donationId === "string" && UUID_RE.test(raw.donationId)) {
    query.donationId = raw.donationId;
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
    query.skip = Math.min(Math.floor(skip), 1_000_000);
  }

  return query;
}

/**
 * Coerce raw query params into a summary query. A valid `month` (YYYY-MM) wins
 * and expands to that month's range; otherwise valid dateFrom/dateTo pass
 * through. An empty result means "let the service default to the current month".
 */
export function parseLedgerSummaryQuery(
  raw: Record<string, unknown> | undefined,
): LedgerSummaryQuery {
  const query: LedgerSummaryQuery = {};
  if (!raw) {
    return query;
  }

  if (typeof raw.month === "string" && isValidMonth(raw.month)) {
    query.month = raw.month;
  }
  if (typeof raw.dateFrom === "string" && isValidIsoDate(raw.dateFrom)) {
    query.dateFrom = raw.dateFrom;
  }
  if (typeof raw.dateTo === "string" && isValidIsoDate(raw.dateTo)) {
    query.dateTo = raw.dateTo;
  }

  return query;
}
