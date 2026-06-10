import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm, ResetPasswordPage, VerifyEmailPage } from "./recovery-view";
import { parseRecoveryHash } from "./recovery";

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
async function setInput(el: Element | null, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
    el?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submitForm(form: Element | null): Promise<void> {
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  while (mounted.length) {
    const e = mounted.pop();
    if (!e) continue;
    act(() => e.root.unmount());
    e.container.remove();
  }
  window.location.hash = "";
  vi.restoreAllMocks();
});

const TOKEN = "a".repeat(64);

function okFetch(): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch;
}

describe("parseRecoveryHash", () => {
  it("extracts plane and token from the emailed link", () => {
    expect(parseRecoveryHash(`#/reset-password/staff?token=${TOKEN}`)).toEqual({ plane: "staff", token: TOKEN });
    expect(parseRecoveryHash(`#/reset-password/devotee?token=${TOKEN}`)).toEqual({ plane: "devotee", token: TOKEN });
    expect(parseRecoveryHash("#/reset-password/staff")).toEqual({ plane: "staff", token: "" });
  });
});

describe("ForgotPasswordForm", () => {
  it("posts the email and shows the SAME generic confirmation (no enumeration)", async () => {
    const fetchFn = okFetch();
    const container = await mount(
      <ForgotPasswordForm options={{ baseUrl: "http://api.test", fetchFn }} plane="staff" onClose={() => undefined} />,
    );
    await setInput(container.querySelector("#forgot-email"), "someone@example.com");
    await submitForm(container.querySelector("form"));

    expect((fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]).toBe(
      "http://api.test/auth/forgot-password",
    );
    expect(container.textContent).toContain("ถ้าอีเมลนี้มีบัญชีอยู่ ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว");
  });

  it("uses the devotee endpoint for the devotee plane", async () => {
    const fetchFn = okFetch();
    const container = await mount(
      <ForgotPasswordForm options={{ baseUrl: "http://api.test", fetchFn }} plane="devotee" onClose={() => undefined} />,
    );
    await setInput(container.querySelector("#forgot-email"), "d@example.com");
    await submitForm(container.querySelector("form"));
    expect((fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]).toBe(
      "http://api.test/devotee/auth/forgot-password",
    );
  });
});

describe("ResetPasswordPage", () => {
  it("validates confirm-password locally, then posts token + new password", async () => {
    window.location.hash = `#/reset-password/staff?token=${TOKEN}`;
    const fetchFn = okFetch();
    const container = await mount(<ResetPasswordPage options={{ baseUrl: "http://api.test", fetchFn }} />);

    await setInput(container.querySelector("#reset-password-new"), "NewPassword123!");
    await setInput(container.querySelector("#reset-password-confirm"), "Mismatch123!");
    await submitForm(container.querySelector("form"));
    expect(container.textContent).toContain("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    expect((fetchFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);

    await setInput(container.querySelector("#reset-password-confirm"), "NewPassword123!");
    await submitForm(container.querySelector("form"));
    const call = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call?.[0]).toBe("http://api.test/auth/reset-password");
    expect(JSON.parse(String((call?.[1] as { body?: string })?.body))).toEqual({
      token: TOKEN,
      newPassword: "NewPassword123!",
    });
    expect(container.textContent).toContain("ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว");
  });

  it("shows a clear error for a link without a token", async () => {
    window.location.hash = "#/reset-password/staff";
    const container = await mount(<ResetPasswordPage options={{ baseUrl: "http://api.test", fetchFn: okFetch() }} />);
    expect(container.textContent).toContain("ลิงก์ไม่ถูกต้อง");
  });
});

describe("VerifyEmailPage", () => {
  it("verifies on mount and confirms in Thai", async () => {
    window.location.hash = `#/verify-email?token=${TOKEN}`;
    const fetchFn = okFetch();
    const container = await mount(<VerifyEmailPage options={{ baseUrl: "http://api.test", fetchFn }} />);
    expect((fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]).toBe(
      "http://api.test/devotee/auth/verify-email",
    );
    expect(container.textContent).toContain("ยืนยันอีเมลเรียบร้อยแล้ว");
  });

  it("surfaces an expired/invalid token as a Thai error with a resend hint", async () => {
    window.location.hash = `#/verify-email?token=${TOKEN}`;
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว" } }), { status: 422 }),
    ) as unknown as typeof fetch;
    const container = await mount(<VerifyEmailPage options={{ baseUrl: "http://api.test", fetchFn }} />);
    expect(container.textContent).toContain("ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว");
    expect(container.textContent).toContain("ส่งลิงก์ยืนยันใหม่");
  });
});
