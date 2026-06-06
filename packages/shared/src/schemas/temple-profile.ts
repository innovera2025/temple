/**
 * Temple profile / master-data validation + types (Task 12).
 *
 * Dependency-free; shared by the NestJS temple module (PATCH validation + 422)
 * and the React profile form. PATCH is a partial patch: only the keys present in
 * the request are updated; an empty string clears an optional field (-> null);
 * nameTh, being required on the temple, may not be cleared.
 */

import { type FieldError, type ValidationResult } from "./donor";

export const TEMPLE_PROFILE_LIMITS = {
  nameTh: 200,
  nameEn: 200,
  addressTh: 300,
  subdistrict: 120,
  district: 120,
  province: 120,
  postalCode: 5,
  phone: 40,
  email: 200,
  lineId: 100,
  websiteUrl: 300,
  abbotName: 200,
  registrationNo: 100,
  taxId: 30,
  denomination: 120,
  // Large enough to hold a client-resized logo embedded as a base64 data URL,
  // as well as an ordinary http(s) link.
  logoUrl: 600000,
  receiptHeaderTh: 500,
  receiptFooterTh: 500,
} as const;

export const TEMPLE_PROFILE_LABELS_TH: Record<string, string> = {
  nameTh: "ชื่อวัด (ไทย)",
  nameEn: "ชื่อวัด (อังกฤษ)",
  addressTh: "ที่อยู่",
  subdistrict: "ตำบล/แขวง",
  district: "อำเภอ/เขต",
  province: "จังหวัด",
  postalCode: "รหัสไปรษณีย์",
  phone: "โทรศัพท์",
  email: "อีเมล",
  lineId: "LINE ID",
  websiteUrl: "เว็บไซต์",
  abbotName: "เจ้าอาวาส",
  registrationNo: "เลขที่หนังสือสำคัญ/ทะเบียนวัด",
  taxId: "เลขประจำตัวผู้เสียภาษี",
  denomination: "นิกาย",
  logoUrl: "ลิงก์โลโก้",
  receiptHeaderTh: "หัวกระดาษใบอนุโมทนา",
  receiptFooterTh: "ท้ายกระดาษใบอนุโมทนา",
};

export interface TempleProfile {
  id: string;
  slug: string;
  status: string;
  nameTh: string;
  nameEn: string | null;
  addressTh: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  websiteUrl: string | null;
  abbotName: string | null;
  registrationNo: string | null;
  taxId: string | null;
  denomination: string | null;
  logoUrl: string | null;
  receiptHeaderTh: string | null;
  receiptFooterTh: string | null;
}

/** A validated patch — only the keys the caller actually sent are present. */
export type TempleProfileUpdate = Partial<Omit<TempleProfile, "id" | "slug" | "status">>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_RE = /^\d{5}$/;
const URL_RE = /^https?:\/\/\S+$/i;
// The logo accepts an http(s) link OR an uploaded image embedded as a base64 data URL.
const LOGO_URL_RE = /^(https?:\/\/\S+|data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface PatchOptions {
  required?: boolean;
  pattern?: RegExp;
  patternMessage?: string;
}

/** Process one optional patch field. Returns whether it was set + the cleaned value. */
function patchField(
  input: Record<string, unknown>,
  key: string,
  max: number,
  errors: FieldError[],
  options: PatchOptions = {},
): { set: boolean; value: string | null } {
  if (!(key in input)) {
    return { set: false, value: null };
  }
  const label = TEMPLE_PROFILE_LABELS_TH[key] ?? key;
  const raw = input[key];

  if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
    if (options.required) {
      errors.push({ field: key, message: `${label}ห้ามเว้นว่าง` });
      return { set: false, value: null };
    }
    return { set: true, value: null };
  }
  if (typeof raw !== "string") {
    errors.push({ field: key, message: `${label}ไม่ถูกต้อง` });
    return { set: false, value: null };
  }

  const trimmed = raw.trim();
  if (trimmed.length > max) {
    errors.push({ field: key, message: `${label}ต้องไม่เกิน ${max} ตัวอักษร` });
    return { set: false, value: null };
  }
  if (options.pattern && !options.pattern.test(trimmed)) {
    errors.push({ field: key, message: options.patternMessage ?? `${label}ไม่ถูกต้อง` });
    return { set: false, value: null };
  }
  return { set: true, value: trimmed };
}

const L = TEMPLE_PROFILE_LIMITS;

export function validateTempleProfileUpdate(input: unknown): ValidationResult<TempleProfileUpdate> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }

  const errors: FieldError[] = [];
  const data: Record<string, string | null> = {};

  const spec: Array<[keyof TempleProfileUpdate, number, PatchOptions]> = [
    ["nameTh", L.nameTh, { required: true }],
    ["nameEn", L.nameEn, {}],
    ["addressTh", L.addressTh, {}],
    ["subdistrict", L.subdistrict, {}],
    ["district", L.district, {}],
    ["province", L.province, {}],
    ["postalCode", L.postalCode, { pattern: POSTAL_RE, patternMessage: "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก" }],
    ["phone", L.phone, {}],
    ["email", L.email, { pattern: EMAIL_RE, patternMessage: "อีเมลไม่ถูกต้อง" }],
    ["lineId", L.lineId, {}],
    ["websiteUrl", L.websiteUrl, { pattern: URL_RE, patternMessage: "เว็บไซต์ต้องขึ้นต้นด้วย http:// หรือ https://" }],
    ["abbotName", L.abbotName, {}],
    ["registrationNo", L.registrationNo, {}],
    ["taxId", L.taxId, {}],
    ["denomination", L.denomination, {}],
    ["logoUrl", L.logoUrl, { pattern: LOGO_URL_RE, patternMessage: "โลโก้ต้องเป็นลิงก์ http:// หรือ https:// หรือไฟล์รูปที่อัปโหลด" }],
    ["receiptHeaderTh", L.receiptHeaderTh, {}],
    ["receiptFooterTh", L.receiptFooterTh, {}],
  ];

  let touched = false;
  for (const [key, max, options] of spec) {
    const result = patchField(input, key, max, errors, options);
    if (result.set) {
      touched = true;
      data[key] = result.value;
    } else if (key in input) {
      // present but invalid still counts as "touched" so we surface field errors, not the empty-patch error
      touched = true;
    }
  }

  // Reject any key outside the editable whitelist (id/slug/status/createdAt/... and
  // typos) instead of silently dropping it — id/slug/status are platform-controlled.
  const allowedKeys = spec.map(([key]) => key as string);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) {
      errors.push({ field: key, message: `ไม่สามารถแก้ไขฟิลด์ "${key}" ได้` });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  if (!touched) {
    return { success: false, errors: [{ field: "_root", message: "ต้องระบุอย่างน้อยหนึ่งฟิลด์ที่จะแก้ไข" }] };
  }
  return { success: true, data: data as TempleProfileUpdate };
}
