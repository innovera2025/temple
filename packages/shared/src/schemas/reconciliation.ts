/**
 * Reconciliation / close-period validation + types (Task 8). Dependency-free,
 * shared by the NestJS API and the React web app.
 *
 * Closing a reconciliation period locks every ledger entry whose entry_date
 * falls within [periodStart, periodEnd] — no more create/void/reconcile on those
 * entries (including donation-posted ones). A period's status is derived from
 * `closedAt` (set = closed), so there is no separate status column.
 */

import { isValidIsoDate } from "./donation";
import type { FieldError, ValidationResult } from "./donor";

export const RECONCILIATION_PERIOD_STATUSES = ["open", "closed"] as const;
export type ReconciliationPeriodStatus = (typeof RECONCILIATION_PERIOD_STATUSES)[number];

export const RECONCILIATION_PERIOD_STATUS_LABELS_TH: Record<ReconciliationPeriodStatus, string> = {
  open: "เปิดอยู่",
  closed: "ปิดงวดแล้ว",
};

/** Derive period status from its closedAt timestamp. */
export function periodStatus(closedAt: string | null | undefined): ReconciliationPeriodStatus {
  return closedAt ? "closed" : "open";
}

export interface ClosePeriodInput {
  /** Inclusive ISO `YYYY-MM-DD` bounds of the accounting period. */
  periodStart: string;
  periodEnd: string;
}

export interface ReconciliationPeriodView {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: ReconciliationPeriodStatus;
  closedAt: string | null;
  closedByUserId: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateDateField(value: unknown, field: string, errors: FieldError[]): string | undefined {
  if (typeof value !== "string" || !isValidIsoDate(value)) {
    errors.push({ field, message: "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)" });
    return undefined;
  }
  return value;
}

export function validateClosePeriod(input: unknown): ValidationResult<ClosePeriodInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "body", message: "ข้อมูลไม่ถูกต้อง" }] };
  }

  const errors: FieldError[] = [];
  const periodStart = validateDateField(input.periodStart, "periodStart", errors);
  const periodEnd = validateDateField(input.periodEnd, "periodEnd", errors);

  // ISO YYYY-MM-DD compares correctly as plain strings.
  if (periodStart && periodEnd && periodStart > periodEnd) {
    errors.push({ field: "periodEnd", message: "วันสิ้นสุดงวดต้องไม่ก่อนวันเริ่มงวด" });
  }

  if (errors.length > 0 || !periodStart || !periodEnd) {
    return { success: false, errors };
  }

  return { success: true, data: { periodStart, periodEnd } };
}
