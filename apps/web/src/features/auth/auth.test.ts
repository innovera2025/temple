import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_FLOW_AVAILABILITY,
  AuthError,
  createAuthApiClient,
  clearSession,
  deriveSession,
  loadSession,
  loginErrorMessage,
  saveSession,
  validateLoginForm,
  validateRegisterForm,
} from "./auth";

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

// Build a (signature-less) JWT whose payload carries the given claims, mirroring the
// server's base64url payload segment so the client decoder can read it.
function fakeJwt(claims: Record<string, unknown>): string {
  const seg = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${seg({ alg: "HS256", typ: "JWT" })}.${seg({ typ: "access", ...claims })}.sig`;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("validateLoginForm", () => {
  it("flags a missing email and password", () => {
    const errors = validateLoginForm({ email: "  ", password: "" });
    expect(errors.email).toBe("กรุณากรอกอีเมล");
    expect(errors.password).toBe("กรุณากรอกรหัสผ่าน");
  });

  it("flags a malformed email but accepts a present password", () => {
    const errors = validateLoginForm({ email: "not-an-email", password: "x" });
    expect(errors.email).toBe("รูปแบบอีเมลไม่ถูกต้อง");
    expect(errors.password).toBeUndefined();
  });

  it("returns no errors for a valid email + password", () => {
    expect(validateLoginForm({ email: "admin@wat-arun.example", password: "secret" })).toEqual({});
  });
});

describe("deriveSession", () => {
  it("derives role / tenant / email purely from the server-verified access-token claims", () => {
    // A real /auth/login token carries { role, tenant_id, email } in its payload.
    const token = fakeJwt({ role: "finance", tenant_id: "wat-pho", email: "khun@wat-pho.example" });
    const session = deriveSession("typed@whatever.example", { accessToken: token, refreshToken: "r" });
    expect(session.user).toEqual({
      email: "khun@wat-pho.example",
      displayName: "khun@wat-pho.example", // JWT has no display name -> email until profile loads
      role: "finance",
      tenantId: "wat-pho",
    });
    expect(session.accessToken).toBe(token);
    expect(session.refreshToken).toBe("r");
  });

  it("falls back to the typed email and least-privileged staff when the token has no claims", () => {
    const session = deriveSession("Someone@Elsewhere.test", { accessToken: "a" });
    expect(session.user.role).toBe("staff"); // never silently "admin"
    expect(session.user.email).toBe("someone@elsewhere.test");
    expect(session.user.displayName).toBe("someone@elsewhere.test");
    expect(session.user.tenantId).toBe("");
  });

  it("ignores an invalid role claim and falls back to least-privileged staff", () => {
    const token = fakeJwt({ role: "superuser", tenant_id: "wat-arun", email: "x@y.example" });
    expect(deriveSession("x@y.example", { accessToken: token }).user.role).toBe("staff");
  });
});

describe("createAuthApiClient", () => {
  it("posts credentials to /auth/login and returns the token pair", async () => {
    const fetchFn = vi.fn(async () => fakeResponse(200, { accessToken: "tok", refreshToken: "ref" }));
    const api = createAuthApiClient({ baseUrl: "http://api", fetchFn: fetchFn as unknown as typeof fetch });

    const tokens = await api.login({ email: " admin@wat-arun.example ", password: "pw" });

    expect(tokens).toEqual({ accessToken: "tok", refreshToken: "ref" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api/auth/login");
    expect(JSON.parse(String(init.body))).toEqual({ email: "admin@wat-arun.example", password: "pw" });
  });

  it("throws an AuthError carrying the HTTP status on failure", async () => {
    const fetchFn = vi.fn(async () => fakeResponse(401, { error: { message: "invalid" } }));
    const api = createAuthApiClient({ baseUrl: "http://api", fetchFn: fetchFn as unknown as typeof fetch });

    await expect(api.login({ email: "a@b.co", password: "pw" })).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
    });
  });

  it("treats a 2xx response with no accessToken as an error (no fake success)", async () => {
    const fetchFn = vi.fn(async () => fakeResponse(200, {}));
    const api = createAuthApiClient({ baseUrl: "http://api", fetchFn: fetchFn as unknown as typeof fetch });

    await expect(api.login({ email: "a@b.co", password: "pw" })).rejects.toBeInstanceOf(AuthError);
  });

  it("posts a self-service register request and returns the pending application", async () => {
    const fetchFn = vi.fn(async () => fakeResponse(201, {
      id: "app-1",
      templeNameTh: "วัดทดสอบ",
      contactEmail: "new@example.test",
      status: "pending",
    }));
    const api = createAuthApiClient({ baseUrl: "http://api", fetchFn: fetchFn as unknown as typeof fetch });

    const result = await api.register({
      templeNameTh: " วัดทดสอบ ",
      contactEmail: " NEW@example.test ",
      password: "Register123!",
      confirmPassword: "Register123!",
      displayName: "ผู้สมัคร",
      acceptedTerms: true,
    });

    expect(result).toEqual({
      id: "app-1",
      templeNameTh: "วัดทดสอบ",
      contactEmail: "new@example.test",
      status: "pending",
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api/auth/register");
    expect(JSON.parse(String(init.body))).toEqual({
      templeNameTh: "วัดทดสอบ",
      contactEmail: "new@example.test",
      password: "Register123!",
      displayName: "ผู้สมัคร",
    });
  });

  it("starts Google/Facebook social signup through the backend config-aware endpoint", async () => {
    const fetchFn = vi.fn(async () => fakeResponse(200, {
      provider: "google",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=s",
      state: "s",
    }));
    const api = createAuthApiClient({ baseUrl: "http://api", fetchFn: fetchFn as unknown as typeof fetch });

    const result = await api.startSocialSignup("google", "http://localhost:5173/oauth/callback");

    expect(result.authUrl).toContain("accounts.google.com");
    const [[url]] = fetchFn.mock.calls as unknown as [[string, RequestInit?]];
    expect(url).toBe(
      "http://api/auth/oauth/google/start?redirectUri=http%3A%2F%2Flocalhost%3A5173%2Foauth%2Fcallback",
    );
  });
});


describe("validateRegisterForm", () => {
  it("requires temple, email, matching password, display name, and terms", () => {
    expect(validateRegisterForm({
      templeNameTh: "",
      contactEmail: "bad",
      password: "short",
      confirmPassword: "other",
      displayName: "",
      acceptedTerms: false,
    })).toMatchObject({
      templeNameTh: expect.any(String),
      contactEmail: expect.any(String),
      password: expect.any(String),
      confirmPassword: expect.any(String),
      displayName: expect.any(String),
      acceptedTerms: expect.any(String),
    });
  });
});

describe("loginErrorMessage", () => {
  it("maps 401 to invalid-credentials Thai copy", () => {
    expect(loginErrorMessage(new AuthError(401, "x"))).toBe("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  });
  it("maps 429 to a rate-limit message", () => {
    expect(loginErrorMessage(new AuthError(429, "x"))).toContain("บ่อยเกินไป");
  });
  it("maps a network TypeError to a connection message", () => {
    expect(loginErrorMessage(new TypeError("fetch failed"))).toContain("เชื่อมต่อ");
  });
  it("falls back to a generic retry message", () => {
    expect(loginErrorMessage(new Error("?"))).toContain("ลองใหม่");
  });
});

describe("unavailable flows are honestly flagged", () => {
  it("enables register, but flags social-login and password-reset as not yet offerable", () => {
    expect(AUTH_FLOW_AVAILABILITY.register).toBe(true);
    // Social buttons render per the design but the OAuth flow is not wired
    // end-to-end (no callback) — the UI shows "coming soon", so the flow is
    // honestly flagged unavailable.
    expect(AUTH_FLOW_AVAILABILITY.socialLogin).toBe(false);
    expect(AUTH_FLOW_AVAILABILITY.passwordReset).toBe(false);
  });
});

describe("session persistence", () => {
  it("round-trips a saved session and clears it", () => {
    const session = deriveSession("admin@wat-arun.example", { accessToken: "a", refreshToken: "r" });
    saveSession(session);
    expect(loadSession()).toEqual(session);
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("returns null for a corrupt stored session", () => {
    window.localStorage.setItem("wat-session", "{not-json");
    expect(loadSession()).toBeNull();
  });
});
