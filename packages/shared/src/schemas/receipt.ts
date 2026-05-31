/**
 * Receipt / ใบอนุโมทนา validation + types (Task 6). Dependency-free, shared by
 * the NestJS API and the React web app. A receipt is always backed by a
 * donation; the money shown comes from that donation (no separate amount field).
 */

import type { ValidationResult } from "./donor";

export const RECEIPT_STATUSES = ["issued", "voided", "superseded"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const RECEIPT_STATUS_LABELS_TH: Record<ReceiptStatus, string> = {
  issued: "ออกแล้ว",
  voided: "ยกเลิก",
  superseded: "ออกใหม่แทนแล้ว",
};

export const RECEIPT_LIMITS = {
  reason: 500,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IssueReceiptInput {
  donationId: string;
}

export interface VoidReceiptInput {
  reason: string;
}

export interface ReissueReceiptInput {
  reason: string;
}

/** Receipt as returned by the API. */
export interface ReceiptView {
  id: string;
  donationId: string;
  receiptNo: string;
  status: ReceiptStatus;
  issuedAt: string;
  supersededByReceiptId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Printable preview payload (temple header + donor + money in digits and Thai words). */
export interface ReceiptPreview {
  receiptNo: string;
  status: ReceiptStatus;
  issuedAt: string;
  templeNameTh: string;
  templeNameEn: string | null;
  /** Optional temple master-data shown on the document (Task 12). */
  templeAddressTh?: string | null;
  templeReceiptHeaderTh?: string | null;
  templeReceiptFooterTh?: string | null;
  donorName: string;
  amountSatang: string;
  amountText: string;
  donationDate: string;
  donationMethod: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateIssueReceipt(input: unknown): ValidationResult<IssueReceiptInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "body", message: "ข้อมูลไม่ถูกต้อง" }] };
  }
  const donationId = input.donationId;
  if (typeof donationId !== "string" || !UUID_RE.test(donationId)) {
    return { success: false, errors: [{ field: "donationId", message: "กรุณาระบุรายการบริจาคที่ถูกต้อง" }] };
  }
  return { success: true, data: { donationId } };
}

/** Shared reason check for void/reissue (reason required -> 422). */
function validateReason(input: unknown): ValidationResult<{ reason: string }> {
  const reason = isPlainObject(input) && typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length === 0) {
    return { success: false, errors: [{ field: "reason", message: "กรุณาระบุเหตุผล" }] };
  }
  if (reason.length > RECEIPT_LIMITS.reason) {
    return {
      success: false,
      errors: [{ field: "reason", message: `เหตุผลยาวเกิน ${RECEIPT_LIMITS.reason} ตัวอักษร` }],
    };
  }
  return { success: true, data: { reason } };
}

export function validateVoidReceipt(input: unknown): ValidationResult<VoidReceiptInput> {
  return validateReason(input);
}

export function validateReissueReceipt(input: unknown): ValidationResult<ReissueReceiptInput> {
  return validateReason(input);
}
