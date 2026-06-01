/**
 * Tenant user-management validation + types (Task 17) — admin manages the users
 * inside their own temple. Dependency-free; shared by the NestJS users module
 * and the React UI. Password is write-only; email is immutable after create.
 */

import { type FieldError, type ValidationResult } from "./donor";
import { TENANT_ROLES, type TenantRole } from "./platform";

// Labels group the tenant capability roles under the canonical access taxonomy
// (see ./access-model): admin = temple_owner; finance/staff = temple_user subroles.
export const TENANT_ROLE_LABELS_TH: Record<TenantRole, string> = {
  admin: "เจ้าของวัด / ผู้ดูแล",
  finance: "คนใช้งานวัด · การเงิน",
  staff: "คนใช้งานวัด · งานทั่วไป",
};

export const USER_LIMITS = {
  email: 200,
  displayName: 200,
  password: 200,
} as const;

export const MIN_USER_PASSWORD_LENGTH = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateUserInput {
  email: string;
  displayName: string;
  role: TenantRole;
  password: string;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: TenantRole;
  isActive?: boolean;
  password?: string;
}

export interface UserSearchQuery {
  q?: string;
  role?: TenantRole;
  isActive?: boolean;
}

const CREATE_KEYS = ["email", "displayName", "role", "password"] as const;
const UPDATE_KEYS = ["displayName", "role", "isActive", "password"] as const;

export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === "string" && (TENANT_ROLES as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePassword(value: unknown, errors: FieldError[]): string | undefined {
  if (typeof value !== "string" || value.length < MIN_USER_PASSWORD_LENGTH) {
    errors.push({ field: "password", message: `รหัสผ่านต้องมีอย่างน้อย ${MIN_USER_PASSWORD_LENGTH} ตัวอักษร` });
    return undefined;
  }
  if (value.length > USER_LIMITS.password) {
    errors.push({ field: "password", message: `รหัสผ่านต้องไม่เกิน ${USER_LIMITS.password} ตัวอักษร` });
    return undefined;
  }
  return value;
}

export function validateCreateUser(input: unknown): ValidationResult<CreateUserInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: Partial<CreateUserInput> = {};

  if (typeof input.email !== "string" || input.email.trim() === "") {
    errors.push({ field: "email", message: "ต้องระบุอีเมล" });
  } else {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > USER_LIMITS.email) {
      errors.push({ field: "email", message: "อีเมลไม่ถูกต้อง" });
    } else {
      data.email = email;
    }
  }

  if (typeof input.displayName !== "string" || input.displayName.trim() === "") {
    errors.push({ field: "displayName", message: "ต้องระบุชื่อที่แสดง" });
  } else if (input.displayName.trim().length > USER_LIMITS.displayName) {
    errors.push({ field: "displayName", message: `ชื่อที่แสดงต้องไม่เกิน ${USER_LIMITS.displayName} ตัวอักษร` });
  } else {
    data.displayName = input.displayName.trim();
  }

  if (!isTenantRole(input.role)) {
    errors.push({ field: "role", message: "ต้องระบุสิทธิ์ (admin / finance / staff)" });
  } else {
    data.role = input.role;
  }

  const password = validatePassword(input.password, errors);
  if (password !== undefined) {
    data.password = password;
  }

  // Reject privileged/unknown keys (isActive/tenantId/id/...) so they cannot be
  // mass-assigned; the service hardcodes isActive + tenantId from the JWT context.
  for (const key of Object.keys(input)) {
    if (!(CREATE_KEYS as readonly string[]).includes(key)) {
      errors.push({ field: key, message: `ไม่สามารถกำหนดฟิลด์ "${key}" ได้` });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: data as CreateUserInput };
}

export function validateUpdateUser(input: unknown): ValidationResult<UpdateUserInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: UpdateUserInput = {};

  if ("displayName" in input) {
    if (typeof input.displayName !== "string" || input.displayName.trim() === "") {
      errors.push({ field: "displayName", message: "ชื่อที่แสดงห้ามว่าง" });
    } else if (input.displayName.trim().length > USER_LIMITS.displayName) {
      errors.push({ field: "displayName", message: `ชื่อที่แสดงต้องไม่เกิน ${USER_LIMITS.displayName} ตัวอักษร` });
    } else {
      data.displayName = input.displayName.trim();
    }
  }
  if ("role" in input) {
    if (isTenantRole(input.role)) data.role = input.role;
    else errors.push({ field: "role", message: "สิทธิ์ไม่ถูกต้อง" });
  }
  if ("isActive" in input) {
    if (typeof input.isActive === "boolean") data.isActive = input.isActive;
    else errors.push({ field: "isActive", message: "สถานะไม่ถูกต้อง" });
  }
  if ("password" in input) {
    const password = validatePassword(input.password, errors);
    if (password !== undefined) data.password = password;
  }

  // Reject email / tenantId / any non-whitelisted key (email is immutable here).
  for (const key of Object.keys(input)) {
    if (!(UPDATE_KEYS as readonly string[]).includes(key)) {
      errors.push({ field: key, message: `ไม่สามารถแก้ไขฟิลด์ "${key}" ได้` });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  if (Object.keys(data).length === 0) {
    return { success: false, errors: [{ field: "_root", message: "ต้องระบุอย่างน้อยหนึ่งฟิลด์ที่จะแก้ไข" }] };
  }
  return { success: true, data };
}

export function parseUserQuery(raw: Record<string, unknown> | undefined): UserSearchQuery {
  const query: UserSearchQuery = {};
  if (!raw) return query;
  if (typeof raw.q === "string" && raw.q.trim() !== "") {
    query.q = raw.q.trim().slice(0, 200);
  }
  if (isTenantRole(raw.role)) query.role = raw.role;
  if (raw.isActive === "true" || raw.isActive === true) query.isActive = true;
  else if (raw.isActive === "false" || raw.isActive === false) query.isActive = false;
  return query;
}
