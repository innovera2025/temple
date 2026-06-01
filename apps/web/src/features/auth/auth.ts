/**
 * Auth feature logic (web Task 4) — framework-free.
 *
 * Ported behaviour for the design's `LoginScreen` / `RegisterForm` / `SocialButtons`
 * (admin-app.jsx; see docs/product/design-ui-map.md §3.1). Only the flows the backend
 * actually supports are wired here:
 *   - POST /auth/login          -> real, used by the login form
 *   - POST /auth/refresh|logout -> exist but are not part of the login screen
 * Registration, social/OAuth login and password reset have NO backend endpoint
 * (design-ui-map.md §6: RegisterForm = future/out-of-scope). They are surfaced in
 * the UI as clearly-disabled "ยังไม่พร้อมใช้งาน" affordances, never as a fake submit.
 */

export type TenantRole = "admin" | "finance" | "staff";

export interface SessionUser {
  email: string;
  displayName: string;
  role: TenantRole;
  tenantId: string;
}

export interface Session {
  accessToken: string;
  refreshToken?: string;
  user: SessionUser;
}

export interface SeedAccount {
  email: string;
  role: TenantRole;
  label: string;
}

// Real seed accounts provisioned by the dev database (packages/db seed). The login
// response only returns tokens, so the display name / role / tenant for the session
// are resolved from this table (and the tenant from the email domain).
export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { email: "admin@wat-arun.example", role: "admin", label: "ผู้ดูแลวัดอรุณ" },
  { email: "finance@wat-arun.example", role: "finance", label: "การเงินวัดอรุณ" },
  { email: "staff@wat-arun.example", role: "staff", label: "เจ้าหน้าที่วัดอรุณ" },
  { email: "admin@wat-pho.example", role: "admin", label: "ผู้ดูแลวัดโพธิ์" },
] as const;

// Shared password for the seed accounts (dev convenience quick-login).
export const DEMO_PASSWORD = "Password123!";

const SESSION_STORAGE_KEY = "wat-session";

// Which pre-login flows the product can honestly offer today. Flip to true only when
// the matching backend endpoint ships — the UI reads these to disable/hide affordances.
export const AUTH_FLOW_AVAILABILITY = {
  register: false,
  socialLogin: false,
  passwordReset: false,
} as const;

export const UNAVAILABLE_LABEL = "ยังไม่พร้อมใช้งาน";

export interface TokenPair {
  accessToken: string;
  refreshToken?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginFormErrors {
  email?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side validation for the login form (matches the design's inline checks). */
export function validateLoginForm(values: LoginCredentials): LoginFormErrors {
  const errors: LoginFormErrors = {};
  const email = values.email.trim();
  if (!email) {
    errors.email = "กรุณากรอกอีเมล";
  } else if (!EMAIL_RE.test(email)) {
    errors.email = "รูปแบบอีเมลไม่ถูกต้อง";
  }
  if (!values.password) {
    errors.password = "กรุณากรอกรหัสผ่าน";
  }
  return errors;
}

export function hasErrors(errors: LoginFormErrors): boolean {
  return Boolean(errors.email || errors.password);
}

const TENANT_ROLES: readonly TenantRole[] = ["admin", "finance", "staff"];

function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === "string" && (TENANT_ROLES as readonly string[]).includes(value);
}

export interface AccessTokenClaims {
  sub?: string;
  tenant_id?: string;
  role?: string;
  email?: string;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  // Node/SSR fallback (no DOM atob).
  return Buffer.from(padded, "base64").toString("utf-8");
}

/**
 * Read the (unverified) claims from a JWT access token payload. The server signs
 * { sub, tenant_id, role, email } (apps/api/src/auth/token.service.ts). We only read
 * them for display + navigation — the API independently verifies the token on every
 * request, so a tampered client payload cannot grant access it does not have.
 */
export function decodeAccessToken(token: string): AccessTokenClaims {
  const segment = token.split(".")[1];
  if (!segment) return {};
  try {
    const payload = JSON.parse(base64UrlDecode(segment)) as Record<string, unknown>;
    return {
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
      tenant_id: typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Build the client session from the issued tokens. Role/tenant/email come from the
 * verified-by-server access-token claims; the seed table only supplies a friendly
 * display label for the demo accounts. Unknown users fall back to the LEAST-privileged
 * role ("staff") — never silently "admin" — and to the typed email/domain heuristic.
 */
export function deriveSession(email: string, tokens: TokenPair): Session {
  const claims = decodeAccessToken(tokens.accessToken);
  const typedEmail = email.trim().toLowerCase();
  const resolvedEmail = (claims.email?.trim().toLowerCase() || typedEmail);
  const account = SEED_ACCOUNTS.find((item) => item.email === resolvedEmail);
  const role: TenantRole = isTenantRole(claims.role) ? claims.role : account?.role ?? "staff";
  const tenantId = claims.tenant_id || (resolvedEmail.includes("wat-pho") ? "wat-pho" : "wat-arun");
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      email: resolvedEmail,
      displayName: account?.label ?? resolvedEmail,
      role,
      tenantId,
    },
  };
}

export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Map a login failure to a friendly Thai message for the error state. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.status === 401) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    if (error.status === 422) return "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
    if (error.status === 429) return "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
    if (error.status >= 500) return "ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง";
    return error.message || "เข้าสู่ระบบไม่สำเร็จ";
  }
  // fetch() rejects with a TypeError when the network/host is unreachable.
  if (error instanceof TypeError) {
    return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่";
  }
  return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่";
}

export interface AuthApi {
  login(credentials: LoginCredentials): Promise<TokenPair>;
}

export interface AuthApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

interface AuthErrorBody {
  error?: { message?: string };
}

export function createAuthApiClient(options: AuthApiClientOptions): AuthApi {
  const doFetch = options.fetchFn ?? fetch;
  return {
    async login(credentials) {
      const response = await doFetch(`${options.baseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: credentials.email.trim(),
          password: credentials.password,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | (AuthErrorBody & TokenPair)
        | null;
      if (!response.ok || !body?.accessToken) {
        const message = body?.error?.message ?? `เข้าสู่ระบบไม่สำเร็จ (${response.status})`;
        throw new AuthError(response.status, message);
      }
      return { accessToken: body.accessToken, refreshToken: body.refreshToken };
    },
  };
}

// --- session persistence (moved out of app.tsx so the view + app share one source) ---

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
