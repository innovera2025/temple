import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_FLOW_AVAILABILITY,
  AuthError,
  createAuthApiClient,
  clearSession,
  DEMO_PASSWORD,
  deriveSession,
  loadSession,
  loginErrorMessage,
  saveSession,
  validateLoginForm,
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
  it("resolves the display name / role / tenant for a known seed account", () => {
    const session = deriveSession("finance@wat-arun.example", { accessToken: "a", refreshToken: "r" });
    expect(session.user).toEqual({
      email: "finance@wat-arun.example",
      displayName: "การเงินวัดอรุณ",
      role: "finance",
      tenantId: "wat-arun",
    });
    expect(session.accessToken).toBe("a");
    expect(session.refreshToken).toBe("r");
  });

  it("derives the wat-pho tenant from the email domain", () => {
    expect(deriveSession("admin@wat-pho.example", { accessToken: "a" }).user.tenantId).toBe("wat-pho");
  });

  it("matches seed accounts case-insensitively", () => {
    expect(deriveSession("ADMIN@WAT-ARUN.EXAMPLE", { accessToken: "a" }).user.role).toBe("admin");
  });

  it("falls back to the least-privileged role (staff), not admin, for an unknown account", () => {
    const session = deriveSession("someone@elsewhere.test", { accessToken: "a" });
    expect(session.user.role).toBe("staff");
    expect(session.user.displayName).toBe("someone@elsewhere.test");
  });

  it("derives role/tenant/email from the access-token claims for a real (non-seed) user", () => {
    // A real /auth/login token carries { role, tenant_id, email } in its payload.
    const token = fakeJwt({ role: "finance", tenant_id: "wat-pho", email: "khun@wat-pho.example" });
    const session = deriveSession("typed@whatever.example", { accessToken: token });
    expect(session.user.role).toBe("finance");
    expect(session.user.tenantId).toBe("wat-pho");
    expect(session.user.email).toBe("khun@wat-pho.example");
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
  it("keeps register / social / password-reset disabled (no backend)", () => {
    expect(AUTH_FLOW_AVAILABILITY.register).toBe(false);
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

  it("exposes the demo password used by quick-login", () => {
    expect(DEMO_PASSWORD).toBe("Password123!");
  });
});
