import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleShell } from "./RoleShell";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { accessGroupForRole, accessGroupLabel, can, defaultPageFor, permOf, ROLE_NAMES } from "./nav";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("nav permission model (design permMatrix)", () => {
  it("matches the design matrix for finance (no people, no roles)", () => {
    expect(can("finance", "donations")).toBe(true);
    expect(can("finance", "ledger")).toBe(true);
    expect(can("finance", "people")).toBe(false);
    expect(can("finance", "roles")).toBe(false);
  });

  it("matches the design matrix for staff (only dashboard/events/people/reports/designsystem)", () => {
    expect(can("staff", "dashboard")).toBe(true);
    expect(can("staff", "events")).toBe(true);
    expect(can("staff", "people")).toBe(true);
    expect(can("staff", "reports")).toBe(true);
    expect(can("staff", "donations")).toBe(false);
    expect(can("staff", "receipt")).toBe(false);
    expect(can("staff", "ledger")).toBe(false);
    expect(can("staff", "roles")).toBe(false);
    expect(can("staff", "audit")).toBe(false);
  });

  it("gives admin full access and exposes no phantom auditor role", () => {
    expect(can("admin", "roles")).toBe(true);
    expect(permOf("admin", "audit")).toBe("full");
    expect(permOf("staff", "dashboard")).toBe("full");
    // The role model is exactly admin/finance/staff — auditor is not a product role.
    expect(Object.keys(ROLE_NAMES).sort()).toEqual(["admin", "finance", "staff"]);
    expect((ROLE_NAMES as Record<string, string>).auditor).toBeUndefined();
  });

  it("maps the tenant roles to the canonical access groups (platform/temple owner/user)", () => {
    expect(accessGroupForRole("admin")).toBe("temple_owner");
    expect(accessGroupForRole("finance")).toBe("temple_user");
    expect(accessGroupForRole("staff")).toBe("temple_user");
    expect(accessGroupLabel("admin")).toBe("เจ้าของวัด");
    expect(accessGroupLabel("finance")).toBe("คนใช้งานวัด");
  });

  it("defaults every role to an allowed landing page", () => {
    expect(defaultPageFor("staff")).toBe("dashboard");
    expect(defaultPageFor("admin")).toBe("dashboard");
  });
});

const noop = (): void => undefined;
const user = { name: "ประยูร พงษ์ศักดิ์", roleName: "ผู้ดูแลระบบ" };

describe("Sidebar (role-filtered NAV from shell.jsx)", () => {
  it("renders the brand and the active page", () => {
    const html = renderToStaticMarkup(
      <Sidebar page="dashboard" role="admin" goto={noop} user={user} can={(id) => can("admin", id)} onLogout={noop} />,
    );
    expect(html).toContain("วัดธรรมสถิตวนาราม");
    expect(html).toContain("sb-item active");
    expect(html).toContain("แดชบอร์ด");
    // EXTRA_NAV (Core Modules outside the design NAV) appears as a labelled group.
    expect(html).toContain("เพิ่มเติม (นอกเหนือดีไซน์)");
    expect(html).toContain("ข้อมูลวัด");
    expect(html).toContain("คลังของบริจาค/พัสดุ");
  });

  it("hides items a staff user cannot access", () => {
    const html = renderToStaticMarkup(
      <Sidebar page="dashboard" role="staff" goto={noop} user={{ name: "สมชาย", roleName: "เจ้าหน้าที่ทั่วไป" }} can={(id) => can("staff", id)} onLogout={noop} />,
    );
    expect(html).toContain("พระสงฆ์และเจ้าหน้าที่");
    expect(html).toContain("รายงานและส่งออก");
    expect(html).not.toContain("การบริจาค");
    expect(html).not.toContain("ใบอนุโมทนาบัตร");
    expect(html).not.toContain("สิทธิ์ผู้ใช้งาน");
  });

  it("shows roles for admin but not for finance", () => {
    const adminHtml = renderToStaticMarkup(
      <Sidebar page="dashboard" role="admin" goto={noop} user={user} can={(id) => can("admin", id)} onLogout={noop} />,
    );
    const financeHtml = renderToStaticMarkup(
      <Sidebar page="dashboard" role="finance" goto={noop} user={{ name: "ศิริพร", roleName: "เจ้าหน้าที่การเงิน" }} can={(id) => can("finance", id)} onLogout={noop} />,
    );
    expect(adminHtml).toContain("สิทธิ์ผู้ใช้งาน");
    expect(financeHtml).not.toContain("สิทธิ์ผู้ใช้งาน");
    expect(financeHtml).not.toContain("พระสงฆ์และเจ้าหน้าที่");
  });
});

describe("Topbar", () => {
  it("shows the breadcrumb page title and the role badge", () => {
    const html = renderToStaticMarkup(
      <Topbar page="ledger" role="finance" roleName="เจ้าหน้าที่การเงิน" onMenu={noop} />,
    );
    expect(html).toContain("วัดธรรมสถิตวนาราม");
    expect(html).toContain("บัญชีรายรับ-รายจ่าย");
    expect(html).toContain("badge credit");
    expect(html).toContain("เจ้าหน้าที่การเงิน");
  });

  it("exposes the hamburger as an accessible toggle (aria-expanded + aria-controls)", () => {
    const closed = renderToStaticMarkup(
      <Topbar page="dashboard" role="admin" roleName="ผู้ดูแลระบบ" onMenu={noop} menuControls="app-sidebar" />,
    );
    expect(closed).toContain("menu-btn");
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('aria-controls="app-sidebar"');
    expect(closed).toContain('aria-label="เปิดเมนู"');

    const open = renderToStaticMarkup(
      <Topbar page="dashboard" role="admin" roleName="ผู้ดูแลระบบ" onMenu={noop} menuOpen menuControls="app-sidebar" />,
    );
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('aria-label="ปิดเมนู"');
  });
});

describe("RoleShell", () => {
  it("composes sidebar + topbar + children and is not the Agent Control Tower", () => {
    const html = renderToStaticMarkup(
      <RoleShell userName="ประยูร พงษ์ศักดิ์" role="admin" page="dashboard" onNavigate={noop} onLogout={noop}>
        <div>เนื้อหาหน้า</div>
      </RoleShell>,
    );
    expect(html).toContain('class="app"');
    expect(html).toContain("วัดธรรมสถิตวนาราม");
    expect(html).toContain("เนื้อหาหน้า");
    expect(html).not.toContain("Agent Control Tower");
    expect(html).not.toContain("orchestrator");
  });

  it("wires the hamburger to the sidebar element and starts closed", () => {
    const html = renderToStaticMarkup(
      <RoleShell userName="ประยูร" role="admin" page="dashboard" onNavigate={noop} onLogout={noop}>
        <div>x</div>
      </RoleShell>,
    );
    // sidebar carries the id the hamburger controls, and is not in the .open state initially
    expect(html).toContain('id="app-sidebar"');
    expect(html).toContain('aria-controls="app-sidebar"');
    expect(html).not.toContain("sidebar open");
    // no backdrop until the drawer is opened
    expect(html).not.toContain("backdrop");
  });
});

describe("RoleShell hamburger drawer (mounted)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.classList.remove("drawer-open");
  });

  const mount = (onNavigate = noop): void => {
    act(() => {
      root.render(
        <RoleShell userName="ประยูร" role="admin" page="dashboard" onNavigate={onNavigate} onLogout={noop}>
          <div>เนื้อหา</div>
        </RoleShell>,
      );
    });
  };

  const sidebar = (): HTMLElement => container.querySelector("#app-sidebar") as HTMLElement;
  const menuBtn = (): HTMLButtonElement => container.querySelector(".menu-btn") as HTMLButtonElement;
  const click = (el: Element | null): void => {
    act(() => {
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  it("toggles the drawer open/closed via the hamburger and locks body scroll", () => {
    mount();
    expect(sidebar().className).not.toContain("open");
    expect(container.querySelector(".backdrop")).toBeNull();
    expect(menuBtn().getAttribute("aria-expanded")).toBe("false");

    click(menuBtn());
    expect(sidebar().className).toContain("open");
    expect(container.querySelector(".backdrop")).not.toBeNull();
    expect(menuBtn().getAttribute("aria-expanded")).toBe("true");
    expect(document.body.classList.contains("drawer-open")).toBe(true);

    click(menuBtn());
    expect(sidebar().className).not.toContain("open");
    expect(document.body.classList.contains("drawer-open")).toBe(false);
  });

  it("closes when the backdrop is clicked", () => {
    mount();
    click(menuBtn());
    expect(sidebar().className).toContain("open");
    click(container.querySelector(".backdrop"));
    expect(sidebar().className).not.toContain("open");
  });

  it("closes when the in-drawer close (✕) button is clicked", () => {
    mount();
    click(menuBtn());
    click(container.querySelector(".sb-close"));
    expect(sidebar().className).not.toContain("open");
  });

  it("closes and navigates when a nav item is chosen", () => {
    const onNavigate = vi.fn();
    mount(onNavigate);
    click(menuBtn());
    const item = container.querySelector(".sb-item") as HTMLButtonElement;
    click(item);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(sidebar().className).not.toContain("open");
  });

  it("closes on Escape", () => {
    mount();
    click(menuBtn());
    expect(sidebar().className).toContain("open");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(sidebar().className).not.toContain("open");
  });

  it("moves focus into the drawer on open and restores it to the hamburger on close", () => {
    mount();
    click(menuBtn());
    // focus lands on the in-drawer close button
    expect(document.activeElement).toBe(container.querySelector(".sb-close"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    // focus returns to the hamburger trigger
    expect(document.activeElement).toBe(menuBtn());
  });

  it("marks the page content inert while the drawer is open", () => {
    mount();
    const main = container.querySelector("main.tb-content") as HTMLElement;
    expect(main.inert).toBe(false);
    click(menuBtn());
    expect(main.inert).toBe(true);
    click(container.querySelector(".backdrop"));
    expect(main.inert).toBe(false);
  });

  it("auto-closes when the viewport grows back to desktop width", () => {
    mount();
    click(menuBtn());
    expect(sidebar().className).toContain("open");
    act(() => {
      Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
      window.dispatchEvent(new Event("resize"));
    });
    expect(sidebar().className).not.toContain("open");
  });
});
