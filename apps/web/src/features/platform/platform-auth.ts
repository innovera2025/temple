/**
 * Platform owner (Innovera / เจ้าของแพลตฟอร์ม) console — framework-free session + API client.
 *
 * The platform plane is TENANT-INDEPENDENT and entirely separate from the temple
 * back-office and the devotee portal (see CLAUDE.md: enters via `/platform/auth`).
 * Its session lives under its OWN localStorage key (`wat-platform-session`) and the
 * access token carries `typ:"platform_access"`, which every tenant/devotee guard rejects.
 */
import type {
  ApplicationStatus,
  ApproveApplicationInput,
  BreakGlassOpenInput,
  PlatformRole,
  TempleStatus,
  TenantRole,
} from "@wat/shared";

const SESSION_STORAGE_KEY = "wat-platform-session";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- session + identity ---

export interface PlatformIdentity {
  id: string;
  email: string;
  platformRole: PlatformRole;
}

export interface PlatformSession {
  accessToken: string;
  refreshToken?: string;
  platform: PlatformIdentity;
}

export interface PlatformTokenPair {
  accessToken: string;
  refreshToken?: string;
}

export interface PlatformLoginValues {
  email: string;
  password: string;
}

export interface PlatformLoginErrors {
  email?: string;
  password?: string;
}

// --- server record shapes (dates are ISO strings over JSON) ---

export interface ApplicationRecord {
  id: string;
  templeNameTh: string;
  contactEmail: string;
  status: ApplicationStatus;
  reviewedByPlatformUserId: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdTempleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TempleRecord {
  id: string;
  slug: string;
  nameTh: string;
  nameEn: string | null;
  status: TempleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApproveResult {
  application: ApplicationRecord;
  temple: TempleRecord;
  adminUserId: string;
}

export interface PlatformUserRecord {
  id: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  isActive: boolean;
  createdAt: string;
}

export interface TenantUserRecord {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: TenantRole;
  isActive: boolean;
  createdAt: string;
}

export interface DevoteeAccountRecord {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface BreakGlassGrantRecord {
  id: string;
  platformUserId: string;
  tenantId: string;
  reason: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface TenantSnapshot {
  tenant: { id: string; slug: string; nameTh: string; status: string };
  counts: { donors: number; donations: number; receipts: number; ledgerEntries: number };
  donationTotalSatang: string;
  recentReceipts: Array<{ receiptNo: string; issuedAt: string; status: string }>;
}

export interface TenantUsersFilter {
  tenantId?: string;
  role?: TenantRole;
  isActive?: boolean;
  email?: string;
}

// --- errors ---

export class PlatformApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PlatformApiError";
    this.status = status;
  }
}

/** Map an API failure to a friendly Thai message. */
export function platformErrorMessage(error: unknown): string {
  if (error instanceof PlatformApiError) {
    if (error.status === 401) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือเซสชันหมดอายุ";
    if (error.status === 403) return "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ (ต้องเป็นผู้ดูแลระบบสูงสุด)";
    if (error.status === 404) return "ไม่พบรายการที่เลือก";
    if (error.status === 409) return "รายการนี้ถูกดำเนินการไปแล้ว หรือข้อมูลซ้ำ";
    if (error.status === 422) return "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
    if (error.status === 429) return "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
    if (error.status >= 500) return "ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง";
    return error.message || "ทำรายการไม่สำเร็จ";
  }
  if (error instanceof TypeError) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ";
  return "ทำรายการไม่สำเร็จ กรุณาลองใหม่";
}

// --- client-side login validation (server re-validates) ---

export function validatePlatformLoginForm(values: PlatformLoginValues): PlatformLoginErrors {
  const errors: PlatformLoginErrors = {};
  const email = values.email.trim();
  if (!email) errors.email = "กรุณากรอกอีเมล";
  else if (!EMAIL_RE.test(email)) errors.email = "รูปแบบอีเมลไม่ถูกต้อง";
  if (!values.password) errors.password = "กรุณากรอกรหัสผ่าน";
  return errors;
}

export function hasPlatformLoginErrors(errors: PlatformLoginErrors): boolean {
  return Boolean(errors.email || errors.password);
}

// --- token claims ---

interface PlatformClaims {
  sub?: string;
  email?: string;
  platform_role?: string;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, "base64").toString("utf-8");
}

function decodeClaims(token: string): PlatformClaims {
  const segment = token.split(".")[1];
  if (!segment) return {};
  try {
    const payload = JSON.parse(base64UrlDecode(segment)) as Record<string, unknown>;
    return {
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
      platform_role: typeof payload.platform_role === "string" ? payload.platform_role : undefined,
    };
  } catch {
    return {};
  }
}

/** Build the console session from the verified token claims (+ the typed email fallback). */
export function derivePlatformSession(
  tokens: PlatformTokenPair,
  fallback: { email: string },
): PlatformSession {
  const claims = decodeClaims(tokens.accessToken);
  const role: PlatformRole = claims.platform_role === "super_admin" ? "super_admin" : "support";
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    platform: {
      id: claims.sub ?? "",
      email: (claims.email || fallback.email).trim().toLowerCase(),
      platformRole: role,
    },
  };
}

export interface AuditLogRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  /** Platform user who did it (null for system rows). */
  actorEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// --- API client ---

export interface PlatformApi {
  login(values: PlatformLoginValues): Promise<PlatformTokenPair>;
  logout(token: string, refreshToken: string): Promise<void>;
  listApplications(token: string, status?: ApplicationStatus): Promise<ApplicationRecord[]>;
  approveApplication(token: string, id: string, input: ApproveApplicationInput): Promise<ApproveResult>;
  rejectApplication(token: string, id: string, reason: string): Promise<ApplicationRecord>;
  listTemples(token: string, status?: TempleStatus): Promise<TempleRecord[]>;
  suspendTemple(token: string, id: string, reason: string): Promise<TempleRecord>;
  resumeTemple(token: string, id: string, reason: string): Promise<TempleRecord>;
  listPlatformUsers(token: string): Promise<PlatformUserRecord[]>;
  enablePlatformUser(token: string, id: string): Promise<PlatformUserRecord>;
  disablePlatformUser(token: string, id: string): Promise<PlatformUserRecord>;
  listTenantUsers(token: string, filter?: TenantUsersFilter): Promise<TenantUserRecord[]>;
  listDevotees(token: string): Promise<DevoteeAccountRecord[]>;
  enableDevotee(token: string, id: string): Promise<DevoteeAccountRecord>;
  disableDevotee(token: string, id: string): Promise<DevoteeAccountRecord>;
  resetPlatformUserPassword(token: string, id: string, newPassword: string): Promise<PlatformUserRecord>;
  resetTenantUserPassword(token: string, id: string, newPassword: string): Promise<TenantUserRecord>;
  resetDevoteePassword(token: string, id: string, newPassword: string): Promise<DevoteeAccountRecord>;
  openBreakGlass(token: string, input: BreakGlassOpenInput): Promise<BreakGlassGrantRecord>;
  listGrants(token: string): Promise<BreakGlassGrantRecord[]>;
  revokeGrant(token: string, id: string): Promise<BreakGlassGrantRecord>;
  tenantSnapshot(token: string, grantId: string): Promise<TenantSnapshot>;
  listAuditLogs(token: string, action?: string): Promise<AuditLogRecord[]>;
}

export interface PlatformApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function createPlatformApiClient(options: PlatformApiClientOptions): PlatformApi {
  const doFetch = options.fetchFn ?? fetch;

  async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
    const body = (await response.json().catch(() => null)) as (ApiErrorBody & T) | null;
    if (!response.ok || body === null) {
      const message = body?.error?.message ?? `${fallbackMessage} (${response.status})`;
      throw new PlatformApiError(response.status, message);
    }
    return body;
  }

  function auth(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }
  function jsonAuth(token: string): Record<string, string> {
    return { "content-type": "application/json", ...auth(token) };
  }
  function qs(params: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `?${s}` : "";
  }
  const url = (path: string): string => `${options.baseUrl}${path}`;

  async function get<T>(path: string, token: string, key: string, fallback: string): Promise<T> {
    const res = await doFetch(url(path), { headers: auth(token) });
    const body = await readJson<Record<string, T>>(res, fallback);
    return body[key] as T;
  }
  async function post<T>(path: string, token: string, payload: unknown, key: string, fallback: string): Promise<T> {
    const res = await doFetch(url(path), { method: "POST", headers: jsonAuth(token), body: JSON.stringify(payload ?? {}) });
    const body = await readJson<Record<string, T>>(res, fallback);
    return body[key] as T;
  }

  return {
    async login(values) {
      const res = await doFetch(url(`/platform/auth/login`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: values.email.trim().toLowerCase(), password: values.password }),
      });
      return readJson<PlatformTokenPair>(res, "เข้าสู่ระบบไม่สำเร็จ");
    },
    async logout(token, refreshToken) {
      await doFetch(url(`/platform/auth/logout`), {
        method: "POST",
        headers: jsonAuth(token),
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    },
    listApplications: (token, status) =>
      get<ApplicationRecord[]>(`/platform/applications${qs({ status })}`, token, "applications", "โหลดใบสมัครไม่สำเร็จ"),
    async approveApplication(token, id, input) {
      // Approve returns the full {application, temple, adminUserId} body (not nested).
      const res = await doFetch(url(`/platform/applications/${id}/approve`), {
        method: "POST",
        headers: jsonAuth(token),
        body: JSON.stringify(input),
      });
      return readJson<ApproveResult>(res, "อนุมัติไม่สำเร็จ");
    },
    rejectApplication: (token, id, reason) =>
      post<ApplicationRecord>(`/platform/applications/${id}/reject`, token, { reason }, "application", "ปฏิเสธไม่สำเร็จ"),
    listTemples: (token, status) =>
      get<TempleRecord[]>(`/platform/temples${qs({ status })}`, token, "temples", "โหลดรายชื่อวัดไม่สำเร็จ"),
    suspendTemple: (token, id, reason) =>
      post<TempleRecord>(`/platform/temples/${id}/suspend`, token, { reason }, "temple", "ระงับวัดไม่สำเร็จ"),
    resumeTemple: (token, id, reason) =>
      post<TempleRecord>(`/platform/temples/${id}/resume`, token, { reason }, "temple", "เปิดใช้วัดไม่สำเร็จ"),
    listPlatformUsers: (token) =>
      get<PlatformUserRecord[]>(`/platform/platform-users`, token, "platformUsers", "โหลดผู้ใช้แพลตฟอร์มไม่สำเร็จ"),
    enablePlatformUser: (token, id) =>
      post<PlatformUserRecord>(`/platform/platform-users/${id}/enable`, token, {}, "platformUser", "เปิดใช้งานไม่สำเร็จ"),
    disablePlatformUser: (token, id) =>
      post<PlatformUserRecord>(`/platform/platform-users/${id}/disable`, token, {}, "platformUser", "ปิดใช้งานไม่สำเร็จ"),
    listDevotees: (token) =>
      get<DevoteeAccountRecord[]>(`/platform/devotees`, token, "devotees", "โหลดบัญชีญาติโยมไม่สำเร็จ"),
    enableDevotee: (token, id) =>
      post<DevoteeAccountRecord>(`/platform/devotees/${id}/enable`, token, {}, "devotee", "เปิดใช้งานไม่สำเร็จ"),
    disableDevotee: (token, id) =>
      post<DevoteeAccountRecord>(`/platform/devotees/${id}/disable`, token, {}, "devotee", "ปิดใช้งานไม่สำเร็จ"),
    resetPlatformUserPassword: (token, id, newPassword) =>
      post<PlatformUserRecord>(`/platform/platform-users/${id}/reset-password`, token, { newPassword }, "platformUser", "รีเซ็ตรหัสผ่านไม่สำเร็จ"),
    resetTenantUserPassword: (token, id, newPassword) =>
      post<TenantUserRecord>(`/platform/users/${id}/reset-password`, token, { newPassword }, "user", "รีเซ็ตรหัสผ่านไม่สำเร็จ"),
    resetDevoteePassword: (token, id, newPassword) =>
      post<DevoteeAccountRecord>(`/platform/devotees/${id}/reset-password`, token, { newPassword }, "devotee", "รีเซ็ตรหัสผ่านไม่สำเร็จ"),
    listTenantUsers: (token, filter = {}) =>
      get<TenantUserRecord[]>(
        `/platform/users${qs({
          tenantId: filter.tenantId,
          role: filter.role,
          isActive: filter.isActive === undefined ? undefined : String(filter.isActive),
          email: filter.email,
        })}`,
        token,
        "users",
        "โหลดผู้ใช้วัดไม่สำเร็จ",
      ),
    openBreakGlass: (token, input) =>
      post<BreakGlassGrantRecord>(`/platform/break-glass`, token, input, "grant", "เปิดสิทธิ์เข้าถึงไม่สำเร็จ"),
    listGrants: (token) => get<BreakGlassGrantRecord[]>(`/platform/break-glass`, token, "grants", "โหลดสิทธิ์เข้าถึงไม่สำเร็จ"),
    listAuditLogs: (token, action) => get<AuditLogRecord[]>(`/platform/audit${qs({ action })}`, token, "logs", "โหลดประวัติการใช้งานไม่สำเร็จ"),
    async revokeGrant(token, id) {
      const res = await doFetch(url(`/platform/break-glass/${id}`), { method: "DELETE", headers: auth(token) });
      const body = await readJson<{ grant: BreakGlassGrantRecord }>(res, "ยกเลิกสิทธิ์ไม่สำเร็จ");
      return body.grant;
    },
    tenantSnapshot: (token, grantId) =>
      get<TenantSnapshot>(`/platform/break-glass/${grantId}/tenant-snapshot`, token, "snapshot", "โหลดข้อมูลวัดไม่สำเร็จ"),
  };
}

// --- session persistence (own key, isolated from staff/devotee) ---

export function loadPlatformSession(): PlatformSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformSession;
  } catch {
    return null;
  }
}

export function savePlatformSession(session: PlatformSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearPlatformSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
