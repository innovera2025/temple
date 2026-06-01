// Navigation + permission model ported from the captured design (shell.jsx NAV/
// PAGE_TITLES; admin-app.jsx PAGE_PERM/permOf; data.jsx permMatrix). Confirmed source
// of truth per the user's decision. See docs/product/design-ui-map.md §2.1.
//
// Roles use the canonical access model (packages/shared access-model): the tenant plane
// has `admin` (= temple_owner) and `finance`/`staff` (= temple_user). The design's
// prototype `auditor` is NOT a product role (no DB enum/seed/API) and is intentionally
// absent here — do not reintroduce it.
import {
  type TenantRole,
  TENANT_ROLE_LABELS_TH,
  accessGroupForTenantRole,
  ACCESS_GROUP_LABELS_TH,
  type AccessGroup,
} from "@wat/shared";
import type { BadgeKind } from "../design-system";

export type PageId =
  | "dashboard"
  | "donations"
  | "donors"
  | "receipt"
  | "ledger"
  | "events"
  | "people"
  | "reports"
  | "roles"
  | "audit"
  | "designsystem"
  // Core Modules (CLAUDE.md) that have backend + views but are NOT in the design
  // NAV (design-ui-map.md open question #13). Surfaced via EXTRA_NAV below.
  | "temple"
  | "inventory";

// The tenant operational roles, aliased to the shared canonical TenantRole (single
// source of truth). No `auditor`.
export type TempleRole = TenantRole;
export type PermLevel = "none" | "view" | "edit" | "full";

export interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}
export interface NavGroup {
  group: string;
  items: NavItem[];
}

// shell.jsx NAV — 4 groups, 11 items (exact labels/ids/icon keys).
export const NAV: NavGroup[] = [
  { group: "ภาพรวม", items: [{ id: "dashboard", label: "แดชบอร์ด", icon: "dashboard" }] },
  {
    group: "การเงินและบริจาค",
    items: [
      { id: "donations", label: "การบริจาค", icon: "donation" },
      { id: "donors", label: "ทะเบียนผู้บริจาค", icon: "donors" },
      { id: "receipt", label: "ใบอนุโมทนาบัตร", icon: "receipt" },
      { id: "ledger", label: "บัญชีรายรับ-รายจ่าย", icon: "ledger" },
    ],
  },
  {
    group: "งานวัด",
    items: [
      { id: "events", label: "กิจกรรมและพิธี", icon: "event" },
      { id: "people", label: "พระสงฆ์และเจ้าหน้าที่", icon: "monks" },
    ],
  },
  {
    group: "รายงานและระบบ",
    items: [
      { id: "reports", label: "รายงานและส่งออก", icon: "reports" },
      { id: "roles", label: "สิทธิ์ผู้ใช้งาน", icon: "roles" },
      { id: "audit", label: "บันทึกการใช้งาน", icon: "audit" },
      { id: "designsystem", label: "ระบบออกแบบ", icon: "settings" },
    ],
  },
];

export const PAGE_TITLES: Record<PageId, string> = {
  dashboard: "แดชบอร์ด",
  donations: "การบริจาค",
  donors: "ทะเบียนผู้บริจาค",
  receipt: "ใบอนุโมทนาบัตร",
  ledger: "บัญชีรายรับ-รายจ่าย",
  events: "กิจกรรมและพิธี",
  people: "พระสงฆ์และเจ้าหน้าที่",
  reports: "รายงานและส่งออก",
  roles: "สิทธิ์ผู้ใช้งาน",
  audit: "บันทึกการใช้งาน",
  designsystem: "ระบบออกแบบ",
  temple: "ข้อมูลวัด",
  inventory: "คลังของบริจาค/พัสดุ",
};

// NOT from the design NAV. Core Modules (CLAUDE.md) that have a working backend +
// existing feature views; surfaced as a clearly-labelled extra group so they are
// reachable while the design's own navigation (NAV) stays untouched.
export const EXTRA_NAV: NavGroup[] = [
  {
    group: "เพิ่มเติม (นอกเหนือดีไซน์)",
    items: [
      { id: "temple", label: "ข้อมูลวัด", icon: "building" },
      { id: "inventory", label: "คลังของบริจาค/พัสดุ", icon: "box" },
    ],
  },
];

// admin-app.jsx PAGE_PERM: pageId -> permission row id. (designsystem is always view.)
const PAGE_PERM: Partial<Record<PageId, string>> = {
  dashboard: "dash",
  donations: "don",
  donors: "don",
  receipt: "rcpt",
  ledger: "ledg",
  events: "evt",
  people: "ppl",
  reports: "rep",
  roles: "role",
  audit: "audit",
};

// data.jsx permMatrix — permission level per role for each function row. The design's
// `auditor` column is dropped (not a product role); admin/finance/staff are preserved.
const PERM_MATRIX: Record<string, Record<TempleRole, PermLevel>> = {
  dash: { admin: "full", finance: "full", staff: "full" },
  don: { admin: "full", finance: "full", staff: "none" },
  rcpt: { admin: "full", finance: "full", staff: "none" },
  ledg: { admin: "full", finance: "full", staff: "none" },
  recon: { admin: "full", finance: "edit", staff: "none" },
  evt: { admin: "full", finance: "view", staff: "edit" },
  ppl: { admin: "full", finance: "none", staff: "edit" },
  rep: { admin: "full", finance: "full", staff: "view" },
  role: { admin: "full", finance: "none", staff: "none" },
  audit: { admin: "full", finance: "view", staff: "none" },
};

// Role display names — the shared, taxonomy-aware tenant-role labels (admin = temple_owner;
// finance/staff = temple_user). Single source of truth in @wat/shared.
export const ROLE_NAMES: Record<TempleRole, string> = TENANT_ROLE_LABELS_TH;

// Topbar role badge colour (shell.jsx Topbar roleMeta).
export const ROLE_BADGE_KIND: Record<TempleRole, BadgeKind> = {
  admin: "reconciled",
  finance: "credit",
  staff: "pending",
};

/** The canonical access group for a tenant role (admin = temple_owner; else temple_user). */
export function accessGroupForRole(role: TempleRole): AccessGroup {
  return accessGroupForTenantRole(role);
}

/** Thai label for the access group a tenant role belongs to. */
export function accessGroupLabel(role: TempleRole): string {
  return ACCESS_GROUP_LABELS_TH[accessGroupForRole(role)];
}

// admin-app.jsx permOf().
export function permOf(role: TempleRole, pageId: PageId): PermLevel {
  if (pageId === "designsystem") return "view";
  const pid = PAGE_PERM[pageId];
  if (!pid) return "view";
  return PERM_MATRIX[pid]?.[role] ?? "none";
}

// Sidebar visibility: shown when the role has any access (not "none").
export function can(role: TempleRole, pageId: PageId): boolean {
  return permOf(role, pageId) !== "none";
}

/** First page the role is allowed to see (for a safe default landing). */
export function defaultPageFor(role: TempleRole): PageId {
  for (const group of NAV) {
    for (const item of group.items) {
      if (can(role, item.id)) return item.id;
    }
  }
  return "dashboard";
}
