/**
 * Donor registry validation + types (Task 4).
 *
 * Single source of truth for donor field rules, shared by the NestJS API
 * (for request validation + 422 errors) and the React web app (form/search).
 * Intentionally dependency-free so it can be consumed from any package without
 * pulling a validation library into the workspace.
 */

export const DONOR_TYPES = ["person", "organization"] as const;
export type DonorType = (typeof DONOR_TYPES)[number];

/** Field length / count limits, exported so UI and API stay in sync. */
export const DONOR_LIMITS = {
  displayName: 200,
  legalName: 200,
  phone: 40,
  lineId: 100,
  email: 200,
  address: 500,
  notes: 2000,
  tag: 50,
  tags: 20,
} as const;

export interface DonorInput {
  displayName: string;
  donorType?: DonorType;
  legalName?: string | null;
  phone?: string | null;
  lineId?: string | null;
  email?: string | null;
  address?: string | null;
  tags?: string[];
  notes?: string | null;
  consent?: boolean;
}

/** Create requires displayName; everything else optional. */
export type CreateDonorInput = DonorInput;

/** Update is a partial patch; at least one field must be present. */
export type UpdateDonorInput = Partial<DonorInput>;

export interface DonorSearchQuery {
  /** Free-text match across name / phone / email / lineId. */
  q?: string;
  tag?: string;
  donorType?: DonorType;
  consent?: boolean;
  take?: number;
  skip?: number;
}

export interface FieldError {
  field: string;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: FieldError[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trim a string; map empty string to undefined so blanks clear optional fields. */
function cleanOptionalString(
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
    errors.push({ field, message: `ยาวเกิน ${max} ตัวอักษร` });
    return undefined;
  }
  return trimmed;
}

function validateTags(value: unknown, errors: FieldError[]): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push({ field: "tags", message: "ต้องเป็นรายการแท็ก" });
    return undefined;
  }
  if (value.length > DONOR_LIMITS.tags) {
    errors.push({ field: "tags", message: `แท็กได้ไม่เกิน ${DONOR_LIMITS.tags} รายการ` });
    return undefined;
  }
  const cleaned: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") {
      errors.push({ field: "tags", message: "แท็กต้องเป็นข้อความ" });
      return undefined;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.length > DONOR_LIMITS.tag) {
      errors.push({ field: "tags", message: `แท็กยาวเกิน ${DONOR_LIMITS.tag} ตัวอักษร` });
      return undefined;
    }
    if (!cleaned.includes(trimmed)) {
      cleaned.push(trimmed);
    }
  }
  return cleaned;
}

function collectDonorFields(
  raw: Record<string, unknown>,
  errors: FieldError[],
): DonorInput {
  const data: DonorInput = { displayName: "" };

  const displayName = cleanOptionalString(
    raw.displayName,
    "displayName",
    DONOR_LIMITS.displayName,
    errors,
  );
  if (typeof displayName === "string") {
    data.displayName = displayName;
  }

  if (raw.donorType !== undefined) {
    if (DONOR_TYPES.includes(raw.donorType as DonorType)) {
      data.donorType = raw.donorType as DonorType;
    } else {
      errors.push({ field: "donorType", message: "ประเภทผู้บริจาคไม่ถูกต้อง" });
    }
  }

  const optionalStringFields: Array<[keyof DonorInput, number]> = [
    ["legalName", DONOR_LIMITS.legalName],
    ["phone", DONOR_LIMITS.phone],
    ["lineId", DONOR_LIMITS.lineId],
    ["address", DONOR_LIMITS.address],
    ["notes", DONOR_LIMITS.notes],
  ];
  for (const [field, max] of optionalStringFields) {
    const value = cleanOptionalString(raw[field], field, max, errors);
    if (value !== undefined) {
      (data as unknown as Record<string, unknown>)[field] = value;
    }
  }

  const email = cleanOptionalString(raw.email, "email", DONOR_LIMITS.email, errors);
  if (email !== undefined) {
    if (typeof email === "string" && !EMAIL_RE.test(email)) {
      errors.push({ field: "email", message: "อีเมลไม่ถูกต้อง" });
    } else {
      data.email = email;
    }
  }

  const tags = validateTags(raw.tags, errors);
  if (tags !== undefined) {
    data.tags = tags;
  }

  if (raw.consent !== undefined) {
    if (typeof raw.consent === "boolean") {
      data.consent = raw.consent;
    } else {
      errors.push({ field: "consent", message: "ค่าความยินยอมไม่ถูกต้อง" });
    }
  }

  return data;
}

export function validateCreateDonor(input: unknown): ValidationResult<CreateDonorInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "body", message: "ข้อมูลไม่ถูกต้อง" }] };
  }

  const errors: FieldError[] = [];
  const data = collectDonorFields(input, errors);

  if (typeof input.displayName !== "string" || input.displayName.trim().length === 0) {
    if (!errors.some((error) => error.field === "displayName")) {
      errors.push({ field: "displayName", message: "กรุณาระบุชื่อผู้บริจาค" });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data };
}

export function validateUpdateDonor(input: unknown): ValidationResult<UpdateDonorInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "body", message: "ข้อมูลไม่ถูกต้อง" }] };
  }

  const errors: FieldError[] = [];
  const data = collectDonorFields(input, errors) as UpdateDonorInput;

  // collectDonorFields seeds displayName=""; drop it unless the caller sent one.
  if (input.displayName === undefined) {
    delete data.displayName;
  } else if (typeof input.displayName !== "string" || input.displayName.trim().length === 0) {
    if (!errors.some((error) => error.field === "displayName")) {
      errors.push({ field: "displayName", message: "ชื่อผู้บริจาคห้ามว่าง" });
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

/** Coerce raw (string-valued) query params into a typed donor search query. */
export function parseDonorSearchQuery(raw: Record<string, unknown> | undefined): DonorSearchQuery {
  const query: DonorSearchQuery = {};
  if (!raw) {
    return query;
  }

  if (typeof raw.q === "string" && raw.q.trim().length > 0) {
    query.q = raw.q.trim();
  }
  if (typeof raw.tag === "string" && raw.tag.trim().length > 0) {
    query.tag = raw.tag.trim();
  }
  if (typeof raw.donorType === "string" && DONOR_TYPES.includes(raw.donorType as DonorType)) {
    query.donorType = raw.donorType as DonorType;
  }
  if (raw.consent === "true" || raw.consent === true) {
    query.consent = true;
  } else if (raw.consent === "false" || raw.consent === false) {
    query.consent = false;
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
