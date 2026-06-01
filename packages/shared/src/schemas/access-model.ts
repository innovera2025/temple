/**
 * Canonical top-level access model (product decision):
 * the system has exactly THREE access groups —
 *
 *   1) platform_owner — เจ้าของ/ผู้ดูแลแพลตฟอร์ม (Innovera plane). Authenticates on the
 *      platform plane (/platform/auth) and has NO tenant context by default; the only
 *      tenant peek is an audited, read-only break-glass grant.
 *   2) temple_owner   — เจ้าของ/ผู้ดูแลวัด. A tenant `admin`: full access inside one temple.
 *   3) temple_user    — คนใช้งานวัด. Tenant operational users (`finance`, `staff`); their
 *      specific capability still drives permissions, but they are ONE access group.
 *
 * This maps the EXISTING, backend-backed roles (PlatformRole on the platform plane,
 * TenantRole on the tenant plane) onto the three groups — it does NOT add a new database
 * enum. There is intentionally NO "auditor": that was a design-prototype role never backed
 * by the schema/seed/API, so it must not appear in the product role model. See
 * docs/product/design-ui-map.md §1.
 */

import { type PlatformRole, type TenantRole } from "./platform";

export const ACCESS_GROUPS = ["platform_owner", "temple_owner", "temple_user"] as const;
export type AccessGroup = (typeof ACCESS_GROUPS)[number];

export const ACCESS_GROUP_LABELS_TH: Record<AccessGroup, string> = {
  platform_owner: "เจ้าของแพลตฟอร์ม",
  temple_owner: "เจ้าของวัด",
  temple_user: "คนใช้งานวัด",
};

export const ACCESS_GROUP_DESCRIPTIONS_TH: Record<AccessGroup, string> = {
  platform_owner: "ผู้ดูแลแพลตฟอร์ม (Innovera) — ไม่มีบริบทของวัดโดยปริยาย",
  temple_owner: "เจ้าของหรือผู้ดูแลวัด — สิทธิ์เต็มภายในวัดของตน",
  temple_user: "เจ้าหน้าที่ผู้ใช้งานวัด — สิทธิ์ตามหน้าที่ (เช่น การเงิน/งานทั่วไป)",
};

export function isAccessGroup(value: unknown): value is AccessGroup {
  return typeof value === "string" && (ACCESS_GROUPS as readonly string[]).includes(value);
}

// Every platform-plane role belongs to the platform_owner group; the explicit map keeps
// this exhaustive, so adding a future PlatformRole forces a deliberate decision here.
const PLATFORM_ROLE_TO_GROUP: Record<PlatformRole, AccessGroup> = {
  super_admin: "platform_owner",
  support: "platform_owner",
};

/** Every platform-plane role belongs to the platform_owner access group. */
export function accessGroupForPlatformRole(role: PlatformRole): AccessGroup {
  return PLATFORM_ROLE_TO_GROUP[role];
}

/** Tenant `admin` is the temple_owner; every other tenant role is a temple_user. */
export function accessGroupForTenantRole(role: TenantRole): AccessGroup {
  return role === "admin" ? "temple_owner" : "temple_user";
}
