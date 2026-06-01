import { act, ReactElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./login-view";
import { AuthError, Session } from "./auth";

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

describe("LoginScreen — design-backed brand + copy", () => {
  it("renders the temple branding and Thai welcome copy", () => {
    const html = renderToStaticMarkup(
      <LoginScreen api={{ login: vi.fn() }} onAuthenticated={noop} />,
    );
    expect(html).toContain("วัดธรรมสถิตวนาราม");
    expect(html).toContain("บริหารงานวัด");
    expect(html).toContain("ยินดีต้อนรับกลับ");
    expect(html).toContain("ลงชื่อเข้าใช้เพื่อจัดการงานของวัด");
    // The three product highlights from the design's brand panel.
    expect(html).toContain("รับบริจาคและออกใบอนุโมทนาบัตร");
    // The submit/tab call-to-action.
    expect(html).toContain("เข้าสู่ระบบ");
  });
});

describe("LoginScreen — honest unavailable flows", () => {
  it("renders social sign-in and forgot-password disabled with a not-ready note", async () => {
    const container = await mount(<LoginScreen api={{ login: vi.fn() }} onAuthenticated={noop} />);
    const social = Array.from(container.querySelectorAll<HTMLButtonElement>(".soc-btn"));
    expect(social.length).toBe(2);
    expect(social.every((b) => b.disabled)).toBe(true);
    expect(container.textContent).toContain("การเข้าสู่ระบบด้วยบัญชีภายนอกยังไม่พร้อมใช้งาน");

    const forgot = container.querySelector<HTMLButtonElement>(".auth-link");
    expect(forgot?.disabled).toBe(true);
  });

  it("switches to an honest register panel with no working submit", async () => {
    const login = vi.fn();
    const container = await mount(<LoginScreen api={{ login }} onAuthenticated={noop} />);

    const registerTab = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("สมัครสมาชิก"),
    );
    await click(registerTab ?? null);

    const panel = container.querySelector('[data-flow="register"]');
    expect(panel).not.toBeNull();
    expect(container.textContent).toContain("ยังไม่เปิดให้สมัครสมาชิกด้วยตนเอง");
    // The login form is gone and the register submit cannot fire.
    expect(container.querySelector("#auth-email")).toBeNull();
    const registerSubmit = panel?.querySelector<HTMLButtonElement>("button.btn-primary");
    expect(registerSubmit?.disabled).toBe(true);
    expect(login).not.toHaveBeenCalled();
  });
});

describe("LoginScreen — real login flow", () => {
  it("logs in with the prefilled seed account and transitions via onAuthenticated", async () => {
    const login = vi.fn(async () => ({ accessToken: "tok", refreshToken: "ref" }));
    let session: Session | null = null;
    const container = await mount(
      <LoginScreen api={{ login }} onAuthenticated={(s) => (session = s)} />,
    );

    await submitForm(container.querySelector("form"));

    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({ email: "admin@wat-arun.example", password: "Password123!" });
    expect(session).not.toBeNull();
    expect(session!.user.role).toBe("admin");
    expect(session!.accessToken).toBe("tok");
  });

  it("shows a Thai error and does not transition on invalid credentials", async () => {
    const login = vi.fn(async () => {
      throw new AuthError(401, "invalid");
    });
    const onAuthenticated = vi.fn();
    const container = await mount(<LoginScreen api={{ login }} onAuthenticated={onAuthenticated} />);

    await submitForm(container.querySelector("form"));

    expect(container.querySelector(".auth-error")?.textContent).toBe("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("blocks submit and shows a field error when the email is empty", async () => {
    const login = vi.fn();
    const container = await mount(<LoginScreen api={{ login }} onAuthenticated={noop} />);

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
    const container = await mount(<LoginScreen api={{ login }} onAuthenticated={onAuthenticated} />);

    await submitForm(container.querySelector("form"));

    const submit = Array.from(container.querySelectorAll<HTMLButtonElement>("button.btn-primary")).find(
      (b) => b.getAttribute("type") === "submit",
    );
    expect(submit?.disabled).toBe(true);
    expect(container.textContent).toContain("กำลังเข้าสู่ระบบ…");
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>(".acct")).every((b) => b.disabled),
    ).toBe(true);
    expect(onAuthenticated).not.toHaveBeenCalled();

    await act(async () => {
      resolveLogin({ accessToken: "tok" });
    });
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("quick-login submits the chosen seed account with the demo password", async () => {
    const login = vi.fn(async () => ({ accessToken: "tok" }));
    let session: Session | null = null;
    const container = await mount(
      <LoginScreen api={{ login }} onAuthenticated={(s) => (session = s)} />,
    );

    const financeBtn = Array.from(container.querySelectorAll<HTMLButtonElement>(".acct")).find((b) =>
      b.textContent?.includes("การเงินวัดอรุณ"),
    );
    await click(financeBtn ?? null);

    expect(login).toHaveBeenCalledWith({ email: "finance@wat-arun.example", password: "Password123!" });
    expect(session!.user.role).toBe("finance");
  });
});
