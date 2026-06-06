/**
 * Devotee (ญาติโยม) self-service portal — framework-free session + API client.
 *
 * A devotee is a TENANT-INDEPENDENT identity (separate plane from temple staff):
 * register/login once, then pick any active temple and donate / view own history.
 * The session lives under its OWN localStorage key (`wat-devotee-session`) so it
 * never collides with a staff `wat-session` in the same browser. The access token
 * carries `typ:"devotee_access"` and is rejected by every staff/platform guard.
 */
import type {
  CeremonyType,
  DonationMethod,
  PublicTempleProfile,
  PublicTempleSummary,
} from "@wat/shared";

export interface DevoteeIdentity {
  id: string;
  email: string;
  displayName: string;
}

export interface DevoteeSession {
  accessToken: string;
  refreshToken?: string;
  devotee: DevoteeIdentity;
}

export interface DevoteeTokenPair {
  accessToken: string;
  refreshToken?: string;
}

export interface DevoteeRegisterValues {
  email: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  phone: string;
}

export interface DevoteeRegisterErrors {
  email?: string;
  displayName?: string;
  password?: string;
  confirmPassword?: string;
  phone?: string;
}

export interface DevoteeLoginValues {
  email: string;
  password: string;
}

export interface DevoteeLoginErrors {
  email?: string;
  password?: string;
}

export interface DevoteeDonationValues {
  amountBaht: string;
  method: DonationMethod;
  donationDate: string;
  note: string;
}

export interface DonationResult {
  donation: {
    id: string;
    amountSatang: string;
    method: string;
    donationDate: string;
    status: string;
  };
  ledgerEntry: { id: string; entryNo: string };
}

export interface DevoteeDonationRecord {
  id: string;
  templeId: string;
  templeNameTh: string;
  amountSatang: string;
  currency: string;
  method: string;
  donationDate: string;
  status: string;
  note: string | null;
  createdAt: string;
}

export interface DevoteeReceiptRecord {
  id: string;
  receiptNo: string;
  status: string;
  issuedAt: string;
  templeId: string;
  templeNameTh: string;
  donationId: string;
  amountSatang: string;
  donationDate: string;
}

export interface DevoteeCeremonyValues {
  ceremonyType: CeremonyType;
  title: string;
  ceremonyDate: string;
  timeNote: string;
  location: string;
  requesterPhone: string;
  note: string;
}

export interface DevoteeCeremonyErrors {
  title?: string;
  ceremonyDate?: string;
}

export interface CeremonyBookingResult {
  booking: { id: string; status: string; title: string; ceremonyDate: string };
}

export interface DevoteeCeremonyRecord {
  id: string;
  templeId: string;
  templeNameTh: string;
  ceremonyType: string;
  title: string;
  ceremonyDate: string;
  status: string;
  timeNote: string | null;
  location: string | null;
  createdAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const SESSION_STORAGE_KEY = "wat-devotee-session";

export class DevoteeApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DevoteeApiError";
    this.status = status;
  }
}

// --- client-side validation (server re-validates everything) ---

export function validateDevoteeRegisterForm(values: DevoteeRegisterValues): DevoteeRegisterErrors {
  const errors: DevoteeRegisterErrors = {};
  const email = values.email.trim();
  const displayName = values.displayName.trim();
  if (!email) errors.email = "กรุณากรอกอีเมล";
  else if (!EMAIL_RE.test(email)) errors.email = "รูปแบบอีเมลไม่ถูกต้อง";
  if (!displayName) errors.displayName = "กรุณากรอกชื่อ-นามสกุล";
  if (!values.password) errors.password = "กรุณากรอกรหัสผ่าน";
  else if (values.password.length < MIN_PASSWORD)
    errors.password = `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
  if (values.confirmPassword !== values.password) errors.confirmPassword = "รหัสผ่านไม่ตรงกัน";
  return errors;
}

export function hasRegisterErrors(errors: DevoteeRegisterErrors): boolean {
  return Boolean(
    errors.email || errors.displayName || errors.password || errors.confirmPassword || errors.phone,
  );
}

export function validateDevoteeLoginForm(values: DevoteeLoginValues): DevoteeLoginErrors {
  const errors: DevoteeLoginErrors = {};
  const email = values.email.trim();
  if (!email) errors.email = "กรุณากรอกอีเมล";
  else if (!EMAIL_RE.test(email)) errors.email = "รูปแบบอีเมลไม่ถูกต้อง";
  if (!values.password) errors.password = "กรุณากรอกรหัสผ่าน";
  return errors;
}

export function hasLoginErrors(errors: DevoteeLoginErrors): boolean {
  return Boolean(errors.email || errors.password);
}

export function validateDevoteeCeremonyForm(values: DevoteeCeremonyValues): DevoteeCeremonyErrors {
  const errors: DevoteeCeremonyErrors = {};
  if (!values.title.trim()) errors.title = "กรุณากรอกชื่อพิธี/งาน";
  if (!values.ceremonyDate) errors.ceremonyDate = "กรุณาเลือกวันที่จัดงาน";
  return errors;
}

export function hasCeremonyErrors(errors: DevoteeCeremonyErrors): boolean {
  return Boolean(errors.title || errors.ceremonyDate);
}

/** Map an API failure to a friendly Thai message. */
export function devoteeErrorMessage(error: unknown): string {
  if (error instanceof DevoteeApiError) {
    if (error.status === 401) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือเซสชันหมดอายุ";
    if (error.status === 409) return "อีเมลนี้ถูกใช้สมัครแล้ว";
    if (error.status === 404) return "ไม่พบวัดที่เลือก";
    if (error.status === 422) return "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
    if (error.status === 429) return "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
    if (error.status >= 500) return "ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง";
    return error.message || "ทำรายการไม่สำเร็จ";
  }
  if (error instanceof TypeError) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ";
  return "ทำรายการไม่สำเร็จ กรุณาลองใหม่";
}

// --- token claims ---

interface DevoteeClaims {
  sub?: string;
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
  return Buffer.from(padded, "base64").toString("utf-8");
}

function decodeClaims(token: string): DevoteeClaims {
  const segment = token.split(".")[1];
  if (!segment) return {};
  try {
    const payload = JSON.parse(base64UrlDecode(segment)) as Record<string, unknown>;
    return {
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    return {};
  }
}

/** Build the portal session. `displayName` is taken from the register/login form
 * (the token carries only sub + email); email/sub come from the verified claims. */
export function deriveDevoteeSession(
  tokens: DevoteeTokenPair,
  fallback: { email: string; displayName?: string },
): DevoteeSession {
  const claims = decodeClaims(tokens.accessToken);
  const email = (claims.email || fallback.email).trim().toLowerCase();
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    devotee: {
      id: claims.sub ?? "",
      email,
      displayName: fallback.displayName?.trim() || email,
    },
  };
}

// --- API client ---

export interface DevoteeApi {
  register(values: DevoteeRegisterValues): Promise<DevoteeTokenPair>;
  login(values: DevoteeLoginValues): Promise<DevoteeTokenPair>;
  listTemples(token: string): Promise<PublicTempleSummary[]>;
  getTemple(token: string, templeId: string): Promise<PublicTempleProfile>;
  donate(token: string, templeId: string, values: DevoteeDonationValues): Promise<DonationResult>;
  bookCeremony(
    token: string,
    templeId: string,
    values: DevoteeCeremonyValues,
  ): Promise<CeremonyBookingResult>;
  myDonations(token: string): Promise<DevoteeDonationRecord[]>;
  myReceipts(token: string): Promise<DevoteeReceiptRecord[]>;
  myCeremonies(token: string): Promise<DevoteeCeremonyRecord[]>;
}

export interface DevoteeApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

/** ฿ string -> integer satang. Returns NaN for an invalid amount. */
export function bahtStringToSatang(value: string): number {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed) * 100);
}

export function createDevoteeApiClient(options: DevoteeApiClientOptions): DevoteeApi {
  const doFetch = options.fetchFn ?? fetch;

  async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
    const body = (await response.json().catch(() => null)) as (ApiErrorBody & T) | null;
    if (!response.ok || body === null) {
      const message = body?.error?.message ?? `${fallbackMessage} (${response.status})`;
      throw new DevoteeApiError(response.status, message);
    }
    return body;
  }

  function authHeaders(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  return {
    async register(values) {
      const response = await doFetch(`${options.baseUrl}/devotee/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: values.email.trim().toLowerCase(),
          displayName: values.displayName.trim(),
          password: values.password,
          ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
        }),
      });
      return readJson<DevoteeTokenPair>(response, "สมัครไม่สำเร็จ");
    },
    async login(values) {
      const response = await doFetch(`${options.baseUrl}/devotee/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: values.email.trim().toLowerCase(), password: values.password }),
      });
      return readJson<DevoteeTokenPair>(response, "เข้าสู่ระบบไม่สำเร็จ");
    },
    async listTemples(token) {
      const response = await doFetch(`${options.baseUrl}/devotee/temples`, {
        headers: authHeaders(token),
      });
      const body = await readJson<{ temples: PublicTempleSummary[] }>(response, "โหลดรายชื่อวัดไม่สำเร็จ");
      return body.temples;
    },
    async getTemple(token, templeId) {
      const response = await doFetch(`${options.baseUrl}/devotee/temples/${templeId}`, {
        headers: authHeaders(token),
      });
      const body = await readJson<{ temple: PublicTempleProfile }>(response, "โหลดข้อมูลวัดไม่สำเร็จ");
      return body.temple;
    },
    async donate(token, templeId, values) {
      const response = await doFetch(`${options.baseUrl}/devotee/temples/${templeId}/donations`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
          amountSatang: bahtStringToSatang(values.amountBaht),
          method: values.method,
          donationDate: values.donationDate,
          ...(values.note.trim() ? { note: values.note.trim() } : {}),
        }),
      });
      return readJson<DonationResult>(response, "บันทึกการบริจาคไม่สำเร็จ");
    },
    async bookCeremony(token, templeId, values) {
      const response = await doFetch(`${options.baseUrl}/devotee/temples/${templeId}/ceremonies`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
          ceremonyType: values.ceremonyType,
          title: values.title.trim(),
          ceremonyDate: values.ceremonyDate,
          ...(values.timeNote.trim() ? { timeNote: values.timeNote.trim() } : {}),
          ...(values.location.trim() ? { location: values.location.trim() } : {}),
          ...(values.requesterPhone.trim() ? { requesterPhone: values.requesterPhone.trim() } : {}),
          ...(values.note.trim() ? { note: values.note.trim() } : {}),
        }),
      });
      return readJson<CeremonyBookingResult>(response, "จองพิธีไม่สำเร็จ");
    },
    async myDonations(token) {
      const response = await doFetch(`${options.baseUrl}/devotee/me/donations`, {
        headers: authHeaders(token),
      });
      const body = await readJson<{ donations: DevoteeDonationRecord[] }>(response, "โหลดประวัติไม่สำเร็จ");
      return body.donations;
    },
    async myReceipts(token) {
      const response = await doFetch(`${options.baseUrl}/devotee/me/receipts`, {
        headers: authHeaders(token),
      });
      const body = await readJson<{ receipts: DevoteeReceiptRecord[] }>(response, "โหลดใบอนุโมทนาไม่สำเร็จ");
      return body.receipts;
    },
    async myCeremonies(token) {
      const response = await doFetch(`${options.baseUrl}/devotee/me/ceremonies`, {
        headers: authHeaders(token),
      });
      const body = await readJson<{ ceremonies: DevoteeCeremonyRecord[] }>(response, "โหลดการจองไม่สำเร็จ");
      return body.ceremonies;
    },
  };
}

// --- session persistence (own key, isolated from staff `wat-session`) ---

export function loadDevoteeSession(): DevoteeSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DevoteeSession;
  } catch {
    return null;
  }
}

export function saveDevoteeSession(session: DevoteeSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearDevoteeSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
