/**
 * Ceremonies / งานบุญ-พิธี (basic records) validation + types (Task 14).
 *
 * Dependency-free; shared by the NestJS ceremonies module (validation + 422) and
 * the React UI. A tenant-scoped record (no hard delete — cancelled via status).
 * Full booking/calendar + monk-invitation linking are deferred to MVP-2.
 */

import { isValidIsoDate } from "./donation";
import { type FieldError, type ValidationResult } from "./donor";

export const CEREMONY_TYPES = ["merit", "funeral", "ordination", "housewarming", "robe_offering", "other"] as const;
export type CeremonyType = (typeof CEREMONY_TYPES)[number];

// `requested` = a devotee-submitted booking awaiting temple-staff confirmation
// (created via the devotee plane). Staff move it to planned/completed/cancelled.
export const CEREMONY_STATUSES = ["requested", "planned", "completed", "cancelled"] as const;
export type CeremonyStatus = (typeof CEREMONY_STATUSES)[number];

// Statuses temple staff may SET (via create/update). `requested` is server-only:
// it is assigned solely by the devotee-booking path, never chosen by staff, so
// staff can confirm (-> planned), complete, or cancel a request but never re-flag
// something as "awaiting confirmation".
export const CEREMONY_STAFF_SETTABLE_STATUSES = ["planned", "completed", "cancelled"] as const;
export type CeremonyStaffStatus = (typeof CEREMONY_STAFF_SETTABLE_STATUSES)[number];

export const CEREMONY_TYPE_LABELS_TH: Record<CeremonyType, string> = {
  merit: "ทำบุญ",
  funeral: "งานศพ/ฌาปนกิจ",
  ordination: "งานอุปสมบท/บรรพชา",
  housewarming: "ทำบุญขึ้นบ้านใหม่",
  robe_offering: "ทอดกฐิน/ผ้าป่า",
  other: "อื่น ๆ",
};

export const CEREMONY_STATUS_LABELS_TH: Record<CeremonyStatus, string> = {
  requested: "รอยืนยัน",
  planned: "กำหนดการ",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export const CEREMONY_LIMITS = {
  title: 200,
  timeNote: 100,
  location: 200,
  requesterName: 200,
  requesterPhone: 40,
  assignedMonks: 1000,
  note: 2000,
} as const;

export const CEREMONY_FIELD_LABELS_TH: Record<string, string> = {
  ceremonyType: "ประเภทงาน",
  status: "สถานะ",
  title: "ชื่องาน",
  ceremonyDate: "วันที่จัดงาน",
  timeNote: "เวลา",
  location: "สถานที่/ศาลา",
  requesterName: "เจ้าภาพ/ผู้ขอ",
  requesterPhone: "โทรศัพท์เจ้าภาพ",
  assignedMonks: "พระที่นิมนต์",
  monkCount: "จำนวนพระ",
  note: "หมายเหตุ",
};

export interface CeremonyInput {
  ceremonyType: CeremonyType;
  status?: CeremonyStatus;
  title: string;
  ceremonyDate: string;
  timeNote?: string | null;
  location?: string | null;
  requesterName?: string | null;
  requesterPhone?: string | null;
  assignedMonks?: string | null;
  monkCount?: number | null;
  note?: string | null;
  /** Publish on the public (unauthenticated) upcoming-events feed. Default false. */
  isPublic?: boolean;
}

export type CreateCeremonyInput = CeremonyInput;
export type UpdateCeremonyInput = Partial<CeremonyInput>;

export interface CeremonySearchQuery {
  q?: string;
  ceremonyType?: CeremonyType;
  status?: CeremonyStatus;
  dateFrom?: string;
  dateTo?: string;
  take?: number;
  skip?: number;
}

const STRING_FIELDS = [
  "timeNote",
  "location",
  "requesterName",
  "requesterPhone",
  "assignedMonks",
  "note",
] as const;
const ALL_KEYS = ["ceremonyType", "status", "title", "ceremonyDate", ...STRING_FIELDS, "monkCount", "isPublic"] as const;
const DEFAULT_TAKE = 100;
const MAX_TAKE = 500;
const MAX_MONK_COUNT = 999;

export function isCeremonyType(value: unknown): value is CeremonyType {
  return typeof value === "string" && (CEREMONY_TYPES as readonly string[]).includes(value);
}

export function isCeremonyStatus(value: unknown): value is CeremonyStatus {
  return typeof value === "string" && (CEREMONY_STATUSES as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function labelFor(key: string): string {
  return CEREMONY_FIELD_LABELS_TH[key] ?? key;
}

function optString(value: unknown, key: string, max: number, errors: FieldError[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string") {
    errors.push({ field: key, message: `${labelFor(key)}ไม่ถูกต้อง` });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({ field: key, message: `${labelFor(key)}ต้องไม่เกิน ${max} ตัวอักษร` });
    return undefined;
  }
  return trimmed;
}

function optMonkCount(value: unknown, errors: FieldError[]): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > MAX_MONK_COUNT) {
      errors.push({ field: "monkCount", message: `จำนวนพระต้องเป็นจำนวนเต็ม 0-${MAX_MONK_COUNT}` });
      return undefined;
    }
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    if (n <= MAX_MONK_COUNT) return n;
  }
  errors.push({ field: "monkCount", message: `จำนวนพระต้องเป็นจำนวนเต็ม 0-${MAX_MONK_COUNT}` });
  return undefined;
}

function applyOptionalFields(input: Record<string, unknown>, data: Record<string, unknown>, errors: FieldError[]): void {
  for (const key of STRING_FIELDS) {
    if (key in input) {
      const v = optString(input[key], key, CEREMONY_LIMITS[key], errors);
      if (v !== undefined) data[key] = v;
    }
  }
  if ("monkCount" in input) {
    const v = optMonkCount(input.monkCount, errors);
    if (v !== undefined) data.monkCount = v;
  }
  if ("isPublic" in input) {
    if (typeof input.isPublic === "boolean") data.isPublic = input.isPublic;
    else errors.push({ field: "isPublic", message: "ค่าการเผยแพร่ไม่ถูกต้อง" });
  }
  if ("status" in input) {
    if (input.status === "requested") {
      // Staff cannot set/keep "requested" — it is assigned only by devotee booking.
      errors.push({ field: "status", message: "ไม่สามารถตั้งสถานะเป็นรอยืนยันได้" });
    } else if (isCeremonyStatus(input.status)) {
      data.status = input.status;
    } else {
      errors.push({ field: "status", message: "สถานะไม่ถูกต้อง" });
    }
  }
}

function rejectUnknownKeys(input: Record<string, unknown>, errors: FieldError[]): void {
  for (const key of Object.keys(input)) {
    if (!(ALL_KEYS as readonly string[]).includes(key)) {
      errors.push({ field: key, message: `ไม่รู้จักฟิลด์ "${key}"` });
    }
  }
}

export function validateCreateCeremony(input: unknown): ValidationResult<CreateCeremonyInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};

  if (!isCeremonyType(input.ceremonyType)) {
    errors.push({ field: "ceremonyType", message: "ต้องระบุประเภทงาน" });
  } else {
    data.ceremonyType = input.ceremonyType;
  }

  if (typeof input.title !== "string" || input.title.trim() === "") {
    errors.push({ field: "title", message: "ต้องระบุชื่องาน" });
  } else if (input.title.trim().length > CEREMONY_LIMITS.title) {
    errors.push({ field: "title", message: `ชื่องานต้องไม่เกิน ${CEREMONY_LIMITS.title} ตัวอักษร` });
  } else {
    data.title = input.title.trim();
  }

  if (typeof input.ceremonyDate !== "string" || !isValidIsoDate(input.ceremonyDate.trim())) {
    errors.push({ field: "ceremonyDate", message: "ต้องระบุวันที่จัดงาน (YYYY-MM-DD)" });
  } else {
    data.ceremonyDate = input.ceremonyDate.trim();
  }

  applyOptionalFields(input, data, errors);
  rejectUnknownKeys(input, errors);

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: data as unknown as CreateCeremonyInput };
}

export function validateUpdateCeremony(input: unknown): ValidationResult<UpdateCeremonyInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};

  if ("ceremonyType" in input) {
    if (isCeremonyType(input.ceremonyType)) data.ceremonyType = input.ceremonyType;
    else errors.push({ field: "ceremonyType", message: "ประเภทงานไม่ถูกต้อง" });
  }
  if ("title" in input) {
    if (typeof input.title !== "string" || input.title.trim() === "") {
      errors.push({ field: "title", message: "ชื่องานห้ามว่าง" });
    } else if (input.title.trim().length > CEREMONY_LIMITS.title) {
      errors.push({ field: "title", message: `ชื่องานต้องไม่เกิน ${CEREMONY_LIMITS.title} ตัวอักษร` });
    } else {
      data.title = input.title.trim();
    }
  }
  if ("ceremonyDate" in input) {
    if (typeof input.ceremonyDate !== "string" || !isValidIsoDate(input.ceremonyDate.trim())) {
      errors.push({ field: "ceremonyDate", message: "วันที่จัดงานต้องเป็น YYYY-MM-DD" });
    } else {
      data.ceremonyDate = input.ceremonyDate.trim();
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
  return { success: true, data: data as UpdateCeremonyInput };
}

export function parseCeremonyQuery(raw: Record<string, unknown> | undefined): CeremonySearchQuery {
  const query: CeremonySearchQuery = {};
  if (!raw) return query;

  if (typeof raw.q === "string" && raw.q.trim() !== "") {
    query.q = raw.q.trim().slice(0, 200);
  }
  if (isCeremonyType(raw.ceremonyType)) query.ceremonyType = raw.ceremonyType;
  if (isCeremonyStatus(raw.status)) query.status = raw.status;
  if (typeof raw.dateFrom === "string" && isValidIsoDate(raw.dateFrom)) query.dateFrom = raw.dateFrom;
  if (typeof raw.dateTo === "string" && isValidIsoDate(raw.dateTo)) query.dateTo = raw.dateTo;

  const take = Number(raw.take);
  query.take = Number.isFinite(take) && take > 0 ? Math.min(Math.floor(take), MAX_TAKE) : DEFAULT_TAKE;
  const skip = Number(raw.skip);
  if (Number.isFinite(skip) && skip > 0) {
    query.skip = Math.min(Math.floor(skip), 1_000_000);
  }

  return query;
}
