/**
 * Devotee (ญาติโยม) self-service plane — validation + shared types. A devotee is a
 * tenant-INDEPENDENT account that picks any active temple per action. Dependency-free;
 * shared by the NestJS devotee module and the React devotee portal.
 */
import { type FieldError, type ValidationResult } from "./donor";
import { DONATION_METHODS, type DonationMethod, isValidIsoDate } from "./donation";
import { CEREMONY_LIMITS, type CeremonyType, isCeremonyType } from "./ceremony";

export const DEVOTEE_LIMITS = {
  email: 200,
  displayName: 200,
  phone: 40,
  note: 500,
  password: 200,
} as const;
export const MIN_DEVOTEE_PASSWORD = 8;
export const MAX_DEVOTEE_DONATION_SATANG = 100_000_000_000; // ฿1,000,000,000 ceiling

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function reqString(value: unknown, field: string, label: string, max: number, errors: FieldError[]): string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({ field, message: `ต้องระบุ${label}` });
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({ field, message: `${label}ต้องไม่เกิน ${max} ตัวอักษร` });
    return "";
  }
  return trimmed;
}
function optString(value: unknown, field: string, label: string, max: number, errors: FieldError[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    errors.push({ field, message: `${label}ไม่ถูกต้อง` });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({ field, message: `${label}ต้องไม่เกิน ${max} ตัวอักษร` });
    return undefined;
  }
  return trimmed;
}

export interface DevoteeRegisterInput {
  email: string;
  displayName: string;
  password: string;
  phone?: string;
}

export function validateDevoteeRegister(input: unknown): ValidationResult<DevoteeRegisterInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  const email = reqString(input.email, "email", "อีเมล", DEVOTEE_LIMITS.email, errors).toLowerCase();
  if (email && !EMAIL_RE.test(email)) errors.push({ field: "email", message: "อีเมลไม่ถูกต้อง" });
  const displayName = reqString(input.displayName, "displayName", "ชื่อ-นามสกุล", DEVOTEE_LIMITS.displayName, errors);
  const phone = optString(input.phone, "phone", "เบอร์โทร", DEVOTEE_LIMITS.phone, errors);
  if (typeof input.password !== "string" || input.password.length < MIN_DEVOTEE_PASSWORD) {
    errors.push({ field: "password", message: `รหัสผ่านต้องมีอย่างน้อย ${MIN_DEVOTEE_PASSWORD} ตัวอักษร` });
  }
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: { email, displayName, password: input.password as string, ...(phone ? { phone } : {}) } };
}

export interface DevoteeLoginInput {
  email: string;
  password: string;
}

export function validateDevoteeLogin(input: unknown): ValidationResult<DevoteeLoginInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  const email = reqString(input.email, "email", "อีเมล", DEVOTEE_LIMITS.email, errors).toLowerCase();
  if (email && !EMAIL_RE.test(email)) errors.push({ field: "email", message: "อีเมลไม่ถูกต้อง" });
  const password = typeof input.password === "string" && input.password.length > 0 ? input.password : "";
  if (!password) errors.push({ field: "password", message: "ต้องระบุรหัสผ่าน" });
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: { email, password } };
}

export interface DevoteeDonationInput {
  amountSatang: number;
  method: DonationMethod;
  donationDate: string;
  note?: string;
}

/** A devotee donation: like a staff donation minus donorId/fundAccountId (server picks both). */
export function validateDevoteeDonation(input: unknown): ValidationResult<DevoteeDonationInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  const amountSatang = input.amountSatang;
  if (typeof amountSatang !== "number" || !Number.isInteger(amountSatang) || amountSatang < 1 || amountSatang > MAX_DEVOTEE_DONATION_SATANG) {
    errors.push({ field: "amountSatang", message: "จำนวนเงินต้องเป็นจำนวนเต็มตั้งแต่ 1 สตางค์ขึ้นไป" });
  }
  const method = input.method;
  if (typeof method !== "string" || !(DONATION_METHODS as readonly string[]).includes(method)) {
    errors.push({ field: "method", message: "ต้องเลือกช่องทางการบริจาค" });
  }
  const donationDate = typeof input.donationDate === "string" ? input.donationDate.trim() : "";
  if (!isValidIsoDate(donationDate)) errors.push({ field: "donationDate", message: "วันที่บริจาคไม่ถูกต้อง (YYYY-MM-DD)" });
  const note = optString(input.note, "note", "หมายเหตุ", DEVOTEE_LIMITS.note, errors);
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: { amountSatang: amountSatang as number, method: method as DonationMethod, donationDate, ...(note ? { note } : {}) } };
}

export interface DevoteeCeremonyInput {
  ceremonyType: CeremonyType;
  title: string;
  ceremonyDate: string;
  timeNote?: string;
  location?: string;
  requesterPhone?: string;
  note?: string;
}

/**
 * A devotee booking a ceremony at a selected temple. The devotee supplies only
 * what a requester knows; the server controls status (-> requested), the requester
 * name (the devotee's own name), the devotee link, and any staff-only fields
 * (assignedMonks/monkCount). Unknown/forged keys are ignored, not honored.
 */
export function validateDevoteeCeremony(input: unknown): ValidationResult<DevoteeCeremonyInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  if (!isCeremonyType(input.ceremonyType)) errors.push({ field: "ceremonyType", message: "ต้องเลือกประเภทพิธี/งาน" });
  const title = reqString(input.title, "title", "ชื่อพิธี/งาน", CEREMONY_LIMITS.title, errors);
  const ceremonyDate = typeof input.ceremonyDate === "string" ? input.ceremonyDate.trim() : "";
  if (!isValidIsoDate(ceremonyDate)) errors.push({ field: "ceremonyDate", message: "วันที่จัดงานไม่ถูกต้อง (YYYY-MM-DD)" });
  const timeNote = optString(input.timeNote, "timeNote", "เวลา", CEREMONY_LIMITS.timeNote, errors);
  const location = optString(input.location, "location", "สถานที่/ศาลา", CEREMONY_LIMITS.location, errors);
  const requesterPhone = optString(input.requesterPhone, "requesterPhone", "เบอร์โทร", CEREMONY_LIMITS.requesterPhone, errors);
  const note = optString(input.note, "note", "หมายเหตุ", CEREMONY_LIMITS.note, errors);
  if (errors.length > 0) return { success: false, errors };
  return {
    success: true,
    data: {
      ceremonyType: input.ceremonyType as CeremonyType,
      title,
      ceremonyDate,
      ...(timeNote ? { timeNote } : {}),
      ...(location ? { location } : {}),
      ...(requesterPhone ? { requesterPhone } : {}),
      ...(note ? { note } : {}),
    },
  };
}

/** Public, devotee-safe temple shapes (no registrationNo/taxId/receipt internals/slug). */
export interface PublicTempleSummary {
  id: string;
  nameTh: string;
  nameEn: string | null;
  province: string | null;
  district: string | null;
  logoUrl: string | null;
}
export interface PublicTempleProfile extends PublicTempleSummary {
  addressTh: string | null;
  subdistrict: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  websiteUrl: string | null;
  abbotName: string | null;
  denomination: string | null;
}
