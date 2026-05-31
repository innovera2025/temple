/**
 * Platform-admin (Innovera plane) validation + types (Task 11).
 *
 * Dependency-free; shared by the NestJS platform module for request validation
 * + 422 errors. The platform plane has NO tenant context and never reads tenant
 * finance by default — break-glass is the only, audited, read-only exception.
 */

import { type FieldError, type ValidationResult } from "./donor";

export const PLATFORM_ROLES = ["super_admin", "support"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const APPLICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const TEMPLE_STATUSES = ["active", "suspended", "archived"] as const;
export type TempleStatus = (typeof TEMPLE_STATUSES)[number];

/** Tenant-user roles, kept here so the cross-tenant directory filter is enum-safe. */
export const TENANT_ROLES = ["admin", "finance", "staff"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const PLATFORM_ROLE_LABELS_TH: Record<PlatformRole, string> = {
  super_admin: "ผู้ดูแลระบบสูงสุด",
  support: "ทีมสนับสนุน",
};

export const APPLICATION_STATUS_LABELS_TH: Record<ApplicationStatus, string> = {
  pending: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
};

export const TEMPLE_STATUS_LABELS_TH: Record<TempleStatus, string> = {
  active: "ใช้งาน",
  suspended: "ระงับการใช้งาน",
  archived: "เก็บถาวร",
};

export const PLATFORM_LIMITS = {
  reason: 1000,
  slug: 60,
  displayName: 200,
  email: 200,
  password: 200,
  templeNameEn: 200,
} as const;

export const MIN_PASSWORD_LENGTH = 8;
export const BREAK_GLASS_MAX_TTL_MINUTES = 120;
export const BREAK_GLASS_DEFAULT_TTL_MINUTES = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Require a non-empty trimmed string within `max`; push a Thai error otherwise. */
function requiredString(
  value: unknown,
  field: string,
  label: string,
  max: number,
  errors: FieldError[],
): string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({ field, message: `ต้องระบุ${label}` });
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({ field, message: `${label}ต้องไม่เกิน ${max} ตัวอักษร` });
    return trimmed;
  }
  return trimmed;
}

/** Optional trimmed string: empty/absent -> undefined; over `max` -> error. */
function optionalString(
  value: unknown,
  field: string,
  label: string,
  max: number,
  errors: FieldError[],
): string | undefined {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return undefined;
  }
  if (typeof value !== "string") {
    errors.push({ field, message: `${label}ไม่ถูกต้อง` });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({ field, message: `${label}ต้องไม่เกิน ${max} ตัวอักษร` });
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Platform auth
// ---------------------------------------------------------------------------

export interface PlatformLoginInput {
  email: string;
  password: string;
}

export function validatePlatformLogin(input: unknown): ValidationResult<PlatformLoginInput> {
  const errors: FieldError[] = [];
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const email = requiredString(input.email, "email", "อีเมล", PLATFORM_LIMITS.email, errors).toLowerCase();
  if (email && !EMAIL_RE.test(email)) {
    errors.push({ field: "email", message: "อีเมลไม่ถูกต้อง" });
  }
  const password =
    typeof input.password === "string" && input.password.length > 0
      ? input.password
      : (errors.push({ field: "password", message: "ต้องระบุรหัสผ่าน" }), "");
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: { email, password } };
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export interface ApproveApplicationInput {
  /** URL-safe unique slug for the new temple. */
  slug: string;
  nameEn?: string;
  /** Bootstrap admin for the new temple; defaults to the application contact email in the service. */
  adminEmail?: string;
  adminDisplayName?: string;
  adminPassword: string;
}

export function validateApproveApplication(input: unknown): ValidationResult<ApproveApplicationInput> {
  const errors: FieldError[] = [];
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }

  const slug = requiredString(input.slug, "slug", "ชื่อย่อ (slug) ของวัด", PLATFORM_LIMITS.slug, errors).toLowerCase();
  if (slug && !SLUG_RE.test(slug)) {
    errors.push({ field: "slug", message: "slug ใช้ได้เฉพาะ a-z, 0-9 และ - (คั่นกลาง)" });
  }

  const nameEn = optionalString(input.nameEn, "nameEn", "ชื่อภาษาอังกฤษ", PLATFORM_LIMITS.templeNameEn, errors);

  const adminEmail = optionalString(input.adminEmail, "adminEmail", "อีเมลแอดมิน", PLATFORM_LIMITS.email, errors)?.toLowerCase();
  if (adminEmail && !EMAIL_RE.test(adminEmail)) {
    errors.push({ field: "adminEmail", message: "อีเมลแอดมินไม่ถูกต้อง" });
  }

  const adminDisplayName = optionalString(
    input.adminDisplayName,
    "adminDisplayName",
    "ชื่อแอดมิน",
    PLATFORM_LIMITS.displayName,
    errors,
  );

  let adminPassword = "";
  if (typeof input.adminPassword !== "string" || input.adminPassword.length < MIN_PASSWORD_LENGTH) {
    errors.push({ field: "adminPassword", message: `รหัสผ่านแอดมินต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` });
  } else if (input.adminPassword.length > PLATFORM_LIMITS.password) {
    errors.push({ field: "adminPassword", message: `รหัสผ่านต้องไม่เกิน ${PLATFORM_LIMITS.password} ตัวอักษร` });
  } else {
    adminPassword = input.adminPassword;
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: { slug, nameEn, adminEmail, adminDisplayName, adminPassword },
  };
}

export interface ReasonInput {
  reason: string;
}

/** Reason is mandatory for reject / suspend / resume (audit trail). */
export function validateReason(input: unknown): ValidationResult<ReasonInput> {
  const errors: FieldError[] = [];
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const reason = requiredString(input.reason, "reason", "เหตุผล", PLATFORM_LIMITS.reason, errors);
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: { reason } };
}

// ---------------------------------------------------------------------------
// Break-glass
// ---------------------------------------------------------------------------

export interface BreakGlassOpenInput {
  tenantId: string;
  reason: string;
  ttlMinutes: number;
}

export function validateBreakGlassOpen(input: unknown): ValidationResult<BreakGlassOpenInput> {
  const errors: FieldError[] = [];
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }

  let tenantId = "";
  if (!isUuid(input.tenantId)) {
    errors.push({ field: "tenantId", message: "ต้องระบุรหัสวัด (tenantId) ที่ถูกต้อง" });
  } else {
    tenantId = input.tenantId;
  }

  const reason = requiredString(input.reason, "reason", "เหตุผลในการเข้าถึง", PLATFORM_LIMITS.reason, errors);

  let ttlMinutes = BREAK_GLASS_DEFAULT_TTL_MINUTES;
  if (input.ttlMinutes !== undefined && input.ttlMinutes !== null) {
    const n = Number(input.ttlMinutes);
    if (!Number.isInteger(n) || n < 1 || n > BREAK_GLASS_MAX_TTL_MINUTES) {
      errors.push({
        field: "ttlMinutes",
        message: `ระยะเวลาต้องเป็นจำนวนเต็ม 1-${BREAK_GLASS_MAX_TTL_MINUTES} นาที`,
      });
    } else {
      ttlMinutes = n;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: { tenantId, reason, ttlMinutes } };
}

// ---------------------------------------------------------------------------
// Query parsers (enum-safe: unknown filter values are dropped, never forwarded
// to a Prisma enum column where they would raise a 500)
// ---------------------------------------------------------------------------

export interface ApplicationsQuery {
  status?: ApplicationStatus;
}

export function parseApplicationsQuery(raw: Record<string, unknown> | undefined): ApplicationsQuery {
  const query: ApplicationsQuery = {};
  if (
    raw &&
    typeof raw.status === "string" &&
    (APPLICATION_STATUSES as readonly string[]).includes(raw.status)
  ) {
    query.status = raw.status as ApplicationStatus;
  }
  return query;
}

export interface TemplesQuery {
  status?: TempleStatus;
}

export function parseTemplesQuery(raw: Record<string, unknown> | undefined): TemplesQuery {
  const query: TemplesQuery = {};
  if (raw && typeof raw.status === "string" && (TEMPLE_STATUSES as readonly string[]).includes(raw.status)) {
    query.status = raw.status as TempleStatus;
  }
  return query;
}

export interface TenantUsersQuery {
  tenantId?: string;
  role?: TenantRole;
  isActive?: boolean;
  email?: string;
}

export function parseTenantUsersQuery(raw: Record<string, unknown> | undefined): TenantUsersQuery {
  const query: TenantUsersQuery = {};
  if (!raw) {
    return query;
  }
  if (isUuid(raw.tenantId)) {
    query.tenantId = raw.tenantId;
  }
  if (typeof raw.role === "string" && (TENANT_ROLES as readonly string[]).includes(raw.role)) {
    query.role = raw.role as TenantRole;
  }
  if (raw.isActive === "true" || raw.isActive === true) {
    query.isActive = true;
  } else if (raw.isActive === "false" || raw.isActive === false) {
    query.isActive = false;
  }
  if (typeof raw.email === "string" && raw.email.trim() !== "") {
    query.email = raw.email.trim().toLowerCase().slice(0, PLATFORM_LIMITS.email);
  }
  return query;
}
