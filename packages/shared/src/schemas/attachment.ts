/**
 * Attachment (แนบหลักฐาน) validation + types (Task 18). Files are uploaded as
 * base64 JSON and stored in the DB. Dependency-free; shared by the NestJS
 * attachments module and the React upload UI.
 */

import { type FieldError, type ValidationResult } from "./donor";
import { isUuid } from "./platform";

export const ATTACHMENT_OWNER_TYPES = ["donation", "receipt", "ledger_entry", "donor"] as const;
export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number];

export const ATTACHMENT_OWNER_TYPE_LABELS_TH: Record<AttachmentOwnerType, string> = {
  donation: "การบริจาค",
  receipt: "ใบอนุโมทนา",
  ledger_entry: "รายการบัญชี",
  donor: "ผู้บริจาค",
};

export const ALLOWED_ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const ATTACHMENT_FILENAME_MAX = 255;

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function isAttachmentOwnerType(value: unknown): value is AttachmentOwnerType {
  return typeof value === "string" && (ATTACHMENT_OWNER_TYPES as readonly string[]).includes(value);
}

export function isAllowedAttachmentMime(value: unknown): value is AttachmentMimeType {
  return typeof value === "string" && (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

function isValidBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && BASE64_RE.test(value);
}

/** Decoded byte length of a (valid) base64 string, without decoding it. */
export function base64ByteLength(value: string): number {
  if (value.length === 0) {
    return 0;
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

/** Strip path separators / quotes / control chars so the name is safe in a Content-Disposition header and cannot encode path traversal. */
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029/\\"]/g, "_").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface UploadAttachmentInput {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  fileName: string;
  mimeType: AttachmentMimeType;
  contentBase64: string;
}

export function validateUploadAttachment(input: unknown): ValidationResult<UploadAttachmentInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: Partial<UploadAttachmentInput> = {};

  if (!isAttachmentOwnerType(input.ownerType)) {
    errors.push({ field: "ownerType", message: "ประเภทเจ้าของไฟล์ไม่ถูกต้อง" });
  } else {
    data.ownerType = input.ownerType;
  }

  if (!isUuid(input.ownerId)) {
    errors.push({ field: "ownerId", message: "ต้องระบุรหัสรายการที่จะแนบ (ownerId) ที่ถูกต้อง" });
  } else {
    data.ownerId = input.ownerId;
  }

  if (typeof input.fileName !== "string" || input.fileName.trim() === "") {
    errors.push({ field: "fileName", message: "ต้องระบุชื่อไฟล์" });
  } else {
    const fileName = sanitizeFileName(input.fileName);
    if (fileName === "" || /^_+$/.test(fileName) || fileName.length > ATTACHMENT_FILENAME_MAX) {
      errors.push({ field: "fileName", message: `ชื่อไฟล์ไม่ถูกต้องหรือยาวเกิน ${ATTACHMENT_FILENAME_MAX} ตัวอักษร` });
    } else {
      data.fileName = fileName;
    }
  }

  if (!isAllowedAttachmentMime(input.mimeType)) {
    errors.push({
      field: "mimeType",
      message: `ชนิดไฟล์ที่รองรับ: ${ALLOWED_ATTACHMENT_MIME_TYPES.join(", ")}`,
    });
  } else {
    data.mimeType = input.mimeType;
  }

  if (typeof input.contentBase64 !== "string" || !isValidBase64(input.contentBase64)) {
    errors.push({ field: "contentBase64", message: "ไฟล์แนบไม่ถูกต้อง" });
  } else {
    const size = base64ByteLength(input.contentBase64);
    if (size < 1) {
      errors.push({ field: "contentBase64", message: "ไฟล์แนบว่างเปล่า" });
    } else if (size > MAX_ATTACHMENT_BYTES) {
      errors.push({ field: "contentBase64", message: `ไฟล์ต้องไม่เกิน ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB` });
    } else {
      data.contentBase64 = input.contentBase64;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: data as UploadAttachmentInput };
}
