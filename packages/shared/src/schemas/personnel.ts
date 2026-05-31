/**
 * Monk / novice / staff (personnel) validation + types (Task 13).
 *
 * Dependency-free; shared by the NestJS personnel module (validation + 422) and
 * the React personnel UI. A tenant-scoped CRM-like entity (no hard delete —
 * archived via status = "inactive").
 */

import { isValidIsoDate } from "./donation";
import { type FieldError, type ValidationResult } from "./donor";

export const PERSONNEL_TYPES = ["monk", "novice", "staff"] as const;
export type PersonnelType = (typeof PERSONNEL_TYPES)[number];

export const PERSONNEL_STATUSES = ["active", "inactive"] as const;
export type PersonnelStatus = (typeof PERSONNEL_STATUSES)[number];

export const PERSONNEL_TYPE_LABELS_TH: Record<PersonnelType, string> = {
  monk: "พระภิกษุ",
  novice: "สามเณร",
  staff: "บุคลากร/ฆราวาส",
};

export const PERSONNEL_STATUS_LABELS_TH: Record<PersonnelStatus, string> = {
  active: "ปฏิบัติหน้าที่",
  inactive: "พ้นสภาพ/ไม่ได้ใช้งาน",
};

export const PERSONNEL_LIMITS = {
  displayName: 200,
  dharmaName: 200,
  secularName: 200,
  rank: 200,
  position: 200,
  ordinationTemple: 200,
  preceptor: 200,
  phone: 40,
  note: 2000,
} as const;

export const PERSONNEL_FIELD_LABELS_TH: Record<string, string> = {
  personnelType: "ประเภท",
  status: "สถานะ",
  displayName: "ชื่อที่แสดง",
  dharmaName: "ฉายา",
  secularName: "ชื่อ-สกุลเดิม",
  rank: "สมณศักดิ์/ยศ",
  position: "ตำแหน่งในวัด",
  ordinationDate: "วันอุปสมบท/บรรพชา",
  ordinationTemple: "วัดที่อุปสมบท",
  preceptor: "พระอุปัชฌาย์",
  phansaCount: "จำนวนพรรษา",
  dateOfBirth: "วันเกิด",
  nationalId: "เลขบัตรประชาชน",
  phone: "โทรศัพท์",
  note: "หมายเหตุ",
  joinedAt: "วันที่เข้าสังกัด",
};

export interface PersonnelInput {
  personnelType: PersonnelType;
  status?: PersonnelStatus;
  displayName: string;
  dharmaName?: string | null;
  secularName?: string | null;
  rank?: string | null;
  position?: string | null;
  ordinationDate?: string | null;
  ordinationTemple?: string | null;
  preceptor?: string | null;
  phansaCount?: number | null;
  dateOfBirth?: string | null;
  nationalId?: string | null;
  phone?: string | null;
  note?: string | null;
  joinedAt?: string | null;
}

export type CreatePersonnelInput = PersonnelInput;
export type UpdatePersonnelInput = Partial<PersonnelInput>;

export interface PersonnelSearchQuery {
  q?: string;
  personnelType?: PersonnelType;
  status?: PersonnelStatus;
  take?: number;
  skip?: number;
}

const NATIONAL_ID_RE = /^\d{13}$/;
const STRING_FIELDS = [
  "dharmaName",
  "secularName",
  "rank",
  "position",
  "ordinationTemple",
  "preceptor",
  "phone",
  "note",
] as const;
const DATE_FIELDS = ["ordinationDate", "dateOfBirth", "joinedAt"] as const;
const ALL_KEYS = [
  "personnelType",
  "status",
  "displayName",
  ...STRING_FIELDS,
  ...DATE_FIELDS,
  "phansaCount",
  "nationalId",
] as const;

const DEFAULT_TAKE = 100;
const MAX_TAKE = 500;

export function isPersonnelType(value: unknown): value is PersonnelType {
  return typeof value === "string" && (PERSONNEL_TYPES as readonly string[]).includes(value);
}

export function isPersonnelStatus(value: unknown): value is PersonnelStatus {
  return typeof value === "string" && (PERSONNEL_STATUSES as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function label(key: string): string {
  return PERSONNEL_FIELD_LABELS_TH[key] ?? key;
}

/** Optional string: empty/null -> null (clear); over max -> error. */
function optString(value: unknown, key: string, max: number, errors: FieldError[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string") {
    errors.push({ field: key, message: `${label(key)}ไม่ถูกต้อง` });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({ field: key, message: `${label(key)}ต้องไม่เกิน ${max} ตัวอักษร` });
    return undefined;
  }
  return trimmed;
}

function optDate(value: unknown, key: string, errors: FieldError[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string" || !isValidIsoDate(value.trim())) {
    errors.push({ field: key, message: `${label(key)}ต้องเป็นวันที่ในรูปแบบ YYYY-MM-DD` });
    return undefined;
  }
  return value.trim();
}

function optPhansa(value: unknown, errors: FieldError[]): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  // Reject non-number JSON types and string tricks (true/[]/"0x10"/"1e2"/" 3 ")
  // that Number() would otherwise coerce silently.
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 200) {
      errors.push({ field: "phansaCount", message: "จำนวนพรรษาต้องเป็นจำนวนเต็ม 0-200" });
      return undefined;
    }
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    if (n <= 200) {
      return n;
    }
  }
  errors.push({ field: "phansaCount", message: "จำนวนพรรษาต้องเป็นจำนวนเต็ม 0-200" });
  return undefined;
}

function optNationalId(value: unknown, errors: FieldError[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string" || !NATIONAL_ID_RE.test(value.trim())) {
    errors.push({ field: "nationalId", message: "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก" });
    return undefined;
  }
  return value.trim();
}

/** Apply every optional field from `input` into `data`, collecting errors. */
function applyOptionalFields(input: Record<string, unknown>, data: Record<string, unknown>, errors: FieldError[]): void {
  for (const key of STRING_FIELDS) {
    if (key in input) {
      const v = optString(input[key], key, PERSONNEL_LIMITS[key], errors);
      if (v !== undefined) data[key] = v;
    }
  }
  for (const key of DATE_FIELDS) {
    if (key in input) {
      const v = optDate(input[key], key, errors);
      if (v !== undefined) data[key] = v;
    }
  }
  if ("phansaCount" in input) {
    const v = optPhansa(input.phansaCount, errors);
    if (v !== undefined) data.phansaCount = v;
  }
  if ("nationalId" in input) {
    const v = optNationalId(input.nationalId, errors);
    if (v !== undefined) data.nationalId = v;
  }
  if ("status" in input) {
    if (isPersonnelStatus(input.status)) data.status = input.status;
    else errors.push({ field: "status", message: "สถานะไม่ถูกต้อง" });
  }
}

function rejectUnknownKeys(input: Record<string, unknown>, errors: FieldError[]): void {
  for (const key of Object.keys(input)) {
    if (!(ALL_KEYS as readonly string[]).includes(key)) {
      errors.push({ field: key, message: `ไม่รู้จักฟิลด์ "${key}"` });
    }
  }
}

export function validateCreatePersonnel(input: unknown): ValidationResult<CreatePersonnelInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};

  if (!isPersonnelType(input.personnelType)) {
    errors.push({ field: "personnelType", message: "ต้องระบุประเภท (พระภิกษุ/สามเณร/บุคลากร)" });
  } else {
    data.personnelType = input.personnelType;
  }

  if (typeof input.displayName !== "string" || input.displayName.trim() === "") {
    errors.push({ field: "displayName", message: "ต้องระบุชื่อที่แสดง" });
  } else if (input.displayName.trim().length > PERSONNEL_LIMITS.displayName) {
    errors.push({ field: "displayName", message: `ชื่อที่แสดงต้องไม่เกิน ${PERSONNEL_LIMITS.displayName} ตัวอักษร` });
  } else {
    data.displayName = input.displayName.trim();
  }

  applyOptionalFields(input, data, errors);
  rejectUnknownKeys(input, errors);

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: data as unknown as CreatePersonnelInput };
}

export function validateUpdatePersonnel(input: unknown): ValidationResult<UpdatePersonnelInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};

  if ("personnelType" in input) {
    if (isPersonnelType(input.personnelType)) data.personnelType = input.personnelType;
    else errors.push({ field: "personnelType", message: "ประเภทไม่ถูกต้อง" });
  }
  if ("displayName" in input) {
    if (typeof input.displayName !== "string" || input.displayName.trim() === "") {
      errors.push({ field: "displayName", message: "ชื่อที่แสดงห้ามว่าง" });
    } else if (input.displayName.trim().length > PERSONNEL_LIMITS.displayName) {
      errors.push({ field: "displayName", message: `ชื่อที่แสดงต้องไม่เกิน ${PERSONNEL_LIMITS.displayName} ตัวอักษร` });
    } else {
      data.displayName = input.displayName.trim();
    }
  }

  applyOptionalFields(input, data, errors);
  rejectUnknownKeys(input, errors);

  if (errors.length > 0) {
    return { success: false, errors };
  }
  if (Object.keys(data).length === 0) {
    return { success: false, errors: [{ field: "_root", message: "ต้องระบุอย่างน้อยหนึ่งฟิลด์ที่จะแก้ไข" }] };
  }
  return { success: true, data: data as UpdatePersonnelInput };
}

export function parsePersonnelQuery(raw: Record<string, unknown> | undefined): PersonnelSearchQuery {
  const query: PersonnelSearchQuery = {};
  if (!raw) return query;

  if (typeof raw.q === "string" && raw.q.trim() !== "") {
    query.q = raw.q.trim().slice(0, 200);
  }
  if (isPersonnelType(raw.personnelType)) {
    query.personnelType = raw.personnelType;
  }
  if (isPersonnelStatus(raw.status)) {
    query.status = raw.status;
  }

  const take = Number(raw.take);
  query.take = Number.isFinite(take) && take > 0 ? Math.min(Math.floor(take), MAX_TAKE) : DEFAULT_TAKE;
  const skip = Number(raw.skip);
  if (Number.isFinite(skip) && skip > 0) {
    query.skip = Math.min(Math.floor(skip), 1_000_000);
  }

  return query;
}
