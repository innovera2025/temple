import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleShell } from "./RoleShell";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { accessGroupForRole, accessGroupLabel, can, defaultPageFor, permOf, ROLE_NAMES } from "./nav";

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
});
