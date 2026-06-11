import { act, ReactElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./login-view";
import { AuthApi, AuthError, Session } from "./auth";

// React's act() requires this flag to be set in a test environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

async function mount(ui: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}

async function click(el: Element | null): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function submitForm(form: Element | null): Promise<void> {
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function setInput(input: Element | null, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  while (mounted.length) {
    const entry = mounted.pop();
    if (!entry) continue;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  vi.restoreAllMocks();
});

const noop = (): void => undefined;

function testApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    login: vi.fn(),
    register: vi.fn(),
    startSocialSignup: vi.fn(),
    ...overrides,
  } as AuthApi;
}

describe("LoginScreen — design-backed brand + copy", () => {
  it("renders the temple branding and Thai welcome copy", () => {
    const html = renderToStaticMarkup(
      <LoginScreen api={testApi()} onAuthenticated={noop} />,
    );
    expect(html).toContain("ระบบจัดการวัด");
    expect(html).toContain("ระบบจัดการวัดออนไลน์ สำหรับเจ้าหน้าที่และญาติโยม");
    expect(html).toContain("จองศาลา จองกุฏิ แจ้งบวช ฌาปนกิจ และร่วมบุญออนไลน์");
    expect(html).toContain("ขอเชิญร่วมบุญ");
    expect(html).toContain("เข้าสู่ระบบเพื่อจองบริการของวัด ร่วมบุญ หรือจัดการงานวัด");
    expect(html).toContain("auth-temple");
    // The submit/tab call-to-action.
    expect(html).toContain("เข้าสู่ระบบ");
    // No specific temple is branded pre-login (the tenant is unknown), and
    // production defaults hide both demo accounts and the social buttons.
    expect(html).not.toContain("วัดธรรมสถิตวนาราม");
    expect(html).not.toContain("บัญชีตัวอย่าง (เดโม)");
    expect(html).not.toContain("soc-btn");
  });

  it("shows the session-expired notice banner when one is passed", () => {
    const html = renderToStaticMarkup(
      <LoginScreen api={testApi()} onAuthenticated={noop} notice="เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" />,
    );
    expect(html).toContain("auth-notice");
    expect(html).toContain("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  });
});

describe("LoginScreen — register/social flows", () => {
  it("renders social sign-in enabled (when opted in) while forgot-password remains disabled", async () => {
    const container = await mount(
      <LoginScreen api={testApi()} onAuthenticated={noop} showSocial />,
    );
    const social = Array.from(container.querySelectorAll<HTMLButtonElement>(".soc-btn"));
    expect(social.length).toBe(2);
    expect(social.every((b) => b.disabled)).toBe(false);
    expect(container.textContent).toContain("Google/Facebook จะใช้งานได้เมื่อ backend ตั้งค่า OAuth provider แล้ว");

    const forgot = container.querySelector<HTMLButtonElement>(".auth-link");
    expect(forgot?.disabled).toBe(true);
  });

  it("switches to a working register panel that submits a pending application request", async () => {
    const login = vi.fn();
    const register = vi.fn(async () => ({
      id: "app-1",
      templeNameTh: "วัดทดสอบ",
      contactEmail: "new@example.test",
      status: "pending" as const,
    }));
    const container = await mount(
      <LoginScreen api={testApi({ login, register })} onAuthenticated={noop} />,
    );

    const registerTab = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("สมัครสมาชิก"),
    );
    await click(registerTab ?? null);

    const panel = container.querySelector('[data-flow="register"]');
    expect(panel).not.toBeNull();
    expect(container.textContent).toContain("ใบสมัครวัดสถานะรอตรวจสอบ");
    expect(container.querySelector("#auth-email")).toBeNull();

    await setInput(container.querySelector("#register-temple"), "วัดทดสอบ");
    await setInput(container.querySelector("#register-name"), "ผู้สมัคร");
    await setInput(container.querySelector("#register-email"), "new@example.test");
    await setInput(container.querySelector("#register-password"), "Register123!");
    await setInput(container.querySelector("#register-confirm-password"), "Register123!");
    await click(panel?.querySelector('input[type="checkbox"]') ?? null);
    await submitForm(panel?.querySelector("form") ?? null);

    expect(register).toHaveBeenCalledWith({
      templeNameTh: "วัดทดสอบ",
      contactEmail: "new@example.test",
      password: "Register123!",
      confirmPassword: "Register123!",
      displayName: "ผู้สมัคร",
      acceptedTerms: true,
    });
    expect(container.textContent).toContain("รับคำขอสมัครของ วัดทดสอบ แล้ว");
    expect(login).not.toHaveBeenCalled();
  });

  it("signup is temple-only (no donor self-service account type)", async () => {
    const container = await mount(<LoginScreen api={testApi()} onAuthenticated={noop} />);
    await click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("สมัครสมาชิก")) ?? null,
    );
    expect(container.querySelector('[data-flow="register"]')).not.toBeNull(); // temple application form
    expect(container.querySelector('[data-flow="register-donor"]')).toBeNull(); // donor account type removed
    expect(container.querySelector("#register-temple")).not.toBeNull();
  });
});

describe("LoginScreen — real login flow", () => {
  it("logs in with the typed credentials and transitions via onAuthenticated", async () => {
    const login = vi.fn(async () => ({ accessToken: "tok", refreshToken: "ref" }));
    let session: Session | null = null;
    const container = await mount(
      <LoginScreen api={testApi({ login })} onAuthenticated={(s) => (session = s)} />,
    );

    // The login form starts empty — no demo prefill.
    await setInput(container.querySelector("#auth-email"), "admin@wat-arun.example");
    await setInput(container.querySelector("#auth-password"), "Password123!");
    await submitForm(container.querySelector("form"));

    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({ email: "admin@wat-arun.example", password: "Password123!" });
    expect(session).not.toBeNull();
    expect(session!.user.email).toBe("admin@wat-arun.example");
    expect(session!.accessToken).toBe("tok");
  });

  it("shows a Thai error and does not transition on invalid credentials", async () => {
    const login = vi.fn(async () => {
      throw new AuthError(401, "invalid");
    });
    const onAuthenticated = vi.fn();
    const container = await mount(
      <LoginScreen api={testApi({ login })} onAuthenticated={onAuthenticated} />,
    );

    await setInput(container.querySelector("#auth-email"), "admin@wat-arun.example");
    await setInput(container.querySelector("#auth-password"), "wrong-password");
    await submitForm(container.querySelector("form"));

    expect(container.querySelector(".auth-error")?.textContent).toBe("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("blocks submit and shows a field error when the email is empty", async () => {
    const login = vi.fn();
    const container = await mount(<LoginScreen api={testApi({ login })} onAuthenticated={noop} />);

    await setInput(container.querySelector("#auth-email"), "");
    await submitForm(container.querySelector("form"));

    expect(login).not.toHaveBeenCalled();
    expect(container.querySelector(".error-text")?.textContent).toBe("กรุณากรอกอีเมล");
  });

  it("disables the controls and shows the busy label while login is in flight", async () => {
    let resolveLogin: (value: { accessToken: string }) => void = () => undefined;
    const login = vi.fn(
      () => new Promise<{ accessToken: string }>((resolve) => (resolveLogin = resolve)),
    );
    const onAuthenticated = vi.fn();
    const container = await mount(
      <LoginScreen api={testApi({ login })} onAuthenticated={onAuthenticated} />,
    );

    await setInput(container.querySelector("#auth-email"), "admin@wat-arun.example");
    await setInput(container.querySelector("#auth-password"), "Password123!");
    await submitForm(container.querySelector("form"));

    const submit = Array.from(container.querySelectorAll<HTMLButtonElement>("button.btn-primary")).find(
      (b) => b.getAttribute("type") === "submit",
    );
    expect(submit?.disabled).toBe(true);
    expect(container.textContent).toContain("กำลังเข้าสู่ระบบ…");
    expect(onAuthenticated).not.toHaveBeenCalled();

    await act(async () => {
      resolveLogin({ accessToken: "tok" });
    });
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });
});
