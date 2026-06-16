/**
 * Auth feature logic (web Task 4) — framework-free.
 *
 * Ported behaviour for the design's `LoginScreen` / `RegisterForm` / `SocialButtons`
 * (admin-app.jsx; see docs/product/design-ui-map.md §3.1). Only the flows the backend
 * actually supports are wired here:
 *   - POST /auth/login          -> real, used by the login form
 *   - POST /auth/register       -> real, creates a pending temple application only
 *   - GET /auth/oauth/:provider/start -> real config-aware OAuth authorization start
 *   - POST /auth/refresh|logout -> exist but are not part of the login screen
 * Password reset still has no backend endpoint and remains disabled.
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

const SESSION_STORAGE_KEY = "wat-session";

// Which pre-login flows the product can honestly offer today. Flip to true only when
// the matching backend endpoint ships — the UI reads these to disable/hide affordances.
export const AUTH_FLOW_AVAILABILITY = {
  register: true,
  // Google/Facebook buttons render per the design but the OAuth flow is not wired
  // end-to-end (no /oauth/callback) — the UI reports "coming soon" on click. Not an
  // honestly-offerable flow yet; flip to true when callback + token exchange ship.
  socialLogin: false,
  passwordReset: false,
} as const;

export const UNAVAILABLE_LABEL = "ยังไม่พร้อมใช้งาน";
export const CONFIG_REQUIRED_LABEL = "ต้องตั้งค่า OAuth provider ก่อนใช้งาน";

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

export interface RegisterInput {
  templeNameTh: string;
  contactEmail: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  acceptedTerms: boolean;
}

export interface RegisterFormErrors {
  templeNameTh?: string;
  contactEmail?: string;
  password?: string;
  confirmPassword?: string;
  displayName?: string;
  acceptedTerms?: string;
}

export interface RegistrationResult {
  id: string;
  templeNameTh: string;
  contactEmail: string;
  status: "pending";
}

export type SocialProvider = "google" | "facebook";

export interface SocialStartResult {
  provider: SocialProvider;
  authUrl: string;
  state: string;
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

export function validateRegisterForm(values: RegisterInput): RegisterFormErrors {
  const errors: RegisterFormErrors = {};
  const templeNameTh = values.templeNameTh.trim();
  const contactEmail = values.contactEmail.trim();
  const displayName = values.displayName.trim();
  if (!templeNameTh) errors.templeNameTh = "กรุณากรอกชื่อวัด";
  if (!contactEmail) {
    errors.contactEmail = "กรุณากรอกอีเมลผู้ติดต่อ";
  } else if (!EMAIL_RE.test(contactEmail)) {
    errors.contactEmail = "รูปแบบอีเมลไม่ถูกต้อง";
  }
  if (!values.password) {
    errors.password = "กรุณากรอกรหัสผ่าน";
  } else if (values.password.length < 8) {
    errors.password = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
  }
  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "รหัสผ่านไม่ตรงกัน";
  }
  if (!displayName) errors.displayName = "กรุณากรอกชื่อผู้ติดต่อ";
  if (!values.acceptedTerms) errors.acceptedTerms = "กรุณายอมรับเงื่อนไขก่อนสมัคร";
  return errors;
}

export function hasRegisterErrors(errors: RegisterFormErrors): boolean {
  return Boolean(
    errors.templeNameTh ||
      errors.contactEmail ||
      errors.password ||
      errors.confirmPassword ||
      errors.displayName ||
      errors.acceptedTerms,
  );
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
 * Build the client session purely from the server-verified access-token claims.
 * Role / tenant / email come from the JWT payload; an invalid or missing role
 * falls back to the LEAST-privileged "staff" — never silently "admin". The JWT
 * carries no display name, so the email is used until the app loads the profile.
 */
export function deriveSession(email: string, tokens: TokenPair): Session {
  const claims = decodeAccessToken(tokens.accessToken);
  const typedEmail = email.trim().toLowerCase();
  const resolvedEmail = claims.email?.trim().toLowerCase() || typedEmail;
  const role: TenantRole = isTenantRole(claims.role) ? claims.role : "staff";
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      email: resolvedEmail,
      displayName: resolvedEmail,
      role,
      tenantId: claims.tenant_id ?? "",
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
  register(input: RegisterInput): Promise<RegistrationResult>;
  startSocialSignup(provider: SocialProvider, redirectUri: string): Promise<SocialStartResult>;
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
    async register(input) {
      const response = await doFetch(`${options.baseUrl}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templeNameTh: input.templeNameTh.trim(),
          contactEmail: input.contactEmail.trim().toLowerCase(),
          password: input.password,
          displayName: input.displayName.trim(),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | (AuthErrorBody & RegistrationResult)
        | null;
      if (!response.ok || body?.status !== "pending" || !body.id) {
        const message = body?.error?.message ?? `สมัครสมาชิกไม่สำเร็จ (${response.status})`;
        throw new AuthError(response.status, message);
      }
      return {
        id: body.id,
        templeNameTh: body.templeNameTh,
        contactEmail: body.contactEmail,
        status: "pending",
      };
    },
    async startSocialSignup(provider, redirectUri) {
      const params = new URLSearchParams({ redirectUri });
      const response = await doFetch(`${options.baseUrl}/auth/oauth/${provider}/start?${params.toString()}`);
      const body = (await response.json().catch(() => null)) as
        | (AuthErrorBody & SocialStartResult)
        | null;
      if (!response.ok || !body?.authUrl || !body.state) {
        const message = body?.error?.message ?? `เริ่มเข้าสู่ระบบด้วย ${provider} ไม่สำเร็จ (${response.status})`;
        throw new AuthError(response.status, message);
      }
      return { provider, authUrl: body.authUrl, state: body.state };
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
