import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignRoles } from "./design-backed-pages";
import type { TenantUser, UsersApi } from "./users/users";

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
  await act(async () => { (el as HTMLElement).click(); });
}
function byText(root: HTMLElement, sel: string, text: string): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).find((e) => e.textContent?.includes(text)) ?? null;
}
async function setValue(el: Element | null, value: string): Promise<void> {
  await act(async () => {
    const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el?.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

afterEach(() => {
  while (mounted.length) {
    const e = mounted.pop();
    if (!e) continue;
    act(() => e.root.unmount());
    e.container.remove();
  }
  vi.restoreAllMocks();
});

function user(over: Partial<TenantUser>): TenantUser {
  return {
    id: "u", email: "siriporn@wat-arun.example", displayName: "ศิริพร อินทรา",
    role: "finance", isActive: true, createdAt: "2569-01-15T00:00:00.000Z", updatedAt: "",
    ...over,
  };
}

describe("DesignRoles — users tab wired to /users", () => {
  it("renders real users with role label, status and account KPIs", async () => {
    const api = {
      list: vi.fn(async () => [
        user({}),
        user({ id: "a", email: "admin@wat-arun.example", displayName: "ประยูร พงษ์ศักดิ์", role: "admin" }),
        user({ id: "x", email: "off@wat-arun.example", displayName: "บุญมา ใจเอื้อ", role: "staff", isActive: false }),
      ]),
    } as unknown as UsersApi;
    const container = await mount(<DesignRoles role="admin" api={api} />);
    expect(api.list).toHaveBeenCalled();
    const text = container.textContent ?? "";
    expect(text).toContain("ศิริพร อินทรา");
    expect(text).toContain("admin@wat-arun.example");
    expect(text).toContain("คนใช้งานวัด · การเงิน"); // finance role label (taxonomy-aware)
    expect(text).toContain("ปิดใช้งาน"); // inactive user status
  });

  it("shows an empty state when there are no users", async () => {
    const api = { list: vi.fn(async () => [] as TenantUser[]) } as unknown as UsersApi;
    const container = await mount(<DesignRoles role="admin" api={api} />);
    expect(container.textContent).toContain("ไม่พบบัญชีผู้ใช้");
  });

  it("surfaces a load error", async () => {
    const api = { list: vi.fn(async () => { throw new Error("x"); }) } as unknown as UsersApi;
    const container = await mount(<DesignRoles role="admin" api={api} />);
    expect(container.textContent).toContain("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
  });

  it("creates a user via the modal (admin)", async () => {
    const created = user({ id: "new", email: "new@wat-arun.example", displayName: "ผู้ใช้ใหม่", role: "staff" });
    const api = { list: vi.fn(async () => [] as TenantUser[]), create: vi.fn(async () => created), update: vi.fn() } as unknown as UsersApi;
    const container = await mount(<DesignRoles role="admin" api={api} />);
    await click(byText(container, "button", "เพิ่มบัญชีผู้ใช้"));
    expect(container.querySelector(".modal")).not.toBeNull();
    await setValue(container.querySelector('.modal input[type="email"]'), "new@wat-arun.example");
    await setValue(container.querySelector('.modal input:not([type="email"]):not([type="password"])'), "ผู้ใช้ใหม่");
    await setValue(container.querySelector('.modal input[type="password"]'), "Secret123!");
    await click(byText(container, ".modal button", "บันทึก"));
    expect(api.create).toHaveBeenCalled();
    const arg = ((api.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? {}) as { email: string; role: string };
    expect(arg.email).toBe("new@wat-arun.example");
    expect(arg.role).toBe("staff");
  });

  it("hides user-management actions for non-admin roles", async () => {
    const api = { list: vi.fn(async () => [user({})]) } as unknown as UsersApi;
    const container = await mount(<DesignRoles role="finance" api={api} />);
    expect(byText(container, "button", "เพิ่มบัญชีผู้ใช้")).toBeNull();
    expect(byText(container, "button", "แก้ไข")).toBeNull();
  });

  it("renders the static permission matrix (the real product model) without an API", () => {
    const html = renderToStaticMarkup(<DesignRoles role="admin" />);
    expect(html).toContain("บทบาทและสิทธิ์"); // perms tab label
    expect(html).toContain("สิทธิ์ผู้ใช้งาน"); // page title
  });
});
