import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApplicationsView } from "./applications-view";
import { PlatformAllUsersView } from "./platform-all-users-view";
import { PlatformAuditView } from "./platform-audit-view";
import { PlatformDashboard } from "./platform-dashboard";
import { PlatformLoginView } from "./platform-login-view";
import { PlatformShell } from "./platform-shell";
import { PlatformUsersView } from "./platform-users-view";
import { TemplesView } from "./temples-view";
import {
  ApplicationRecord,
  ApproveResult,
  PlatformApi,
  PlatformUserRecord,
  TempleRecord,
  hasPlatformLoginErrors,
  validatePlatformLoginForm,
} from "./platform-auth";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pendingApp: ApplicationRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  templeNameTh: "วัดขอสมัครเดโม",
  contactEmail: "apply@example.com",
  status: "pending",
  reviewedByPlatformUserId: null,
  reviewedAt: null,
  rejectionReason: null,
  createdTempleId: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const temple: TempleRecord = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  slug: "wat-apply",
  nameTh: "วัดขอสมัครเดโม",
  nameEn: null,
  status: "active",
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

const approveResult: ApproveResult = { application: { ...pendingApp, status: "approved" }, temple, adminUserId: "u1" };

const platformUser: PlatformUserRecord = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  email: "support@innovera.example",
  displayName: "ทีมสนับสนุน",
  platformRole: "support",
  isActive: true,
  createdAt: "2026-05-01T00:00:00.000Z",
};

function makeApi(overrides: Partial<PlatformApi> = {}): PlatformApi {
  return {
    login: async () => ({ accessToken: "a", refreshToken: "r" }),
    logout: async () => undefined,
    listApplications: async () => [pendingApp],
    approveApplication: async () => approveResult,
    rejectApplication: async () => ({ ...pendingApp, status: "rejected" }),
    listTemples: async () => [temple],
    suspendTemple: async () => ({ ...temple, status: "suspended" }),
    resumeTemple: async () => temple,
    listPlatformUsers: async () => [platformUser],
    enablePlatformUser: async () => ({ ...platformUser, isActive: true }),
    disablePlatformUser: async () => ({ ...platformUser, isActive: false }),
    listTenantUsers: async () => [],
    openBreakGlass: async () => ({ id: "g1", platformUserId: "u1", tenantId: temple.id, reason: "x", expiresAt: "2026-06-02T01:00:00.000Z", revokedAt: null, createdAt: "2026-06-02T00:00:00.000Z" }),
    listGrants: async () => [],
    revokeGrant: async () => ({ id: "g1", platformUserId: "u1", tenantId: temple.id, reason: "x", expiresAt: "2026-06-02T01:00:00.000Z", revokedAt: "2026-06-02T00:30:00.000Z", createdAt: "2026-06-02T00:00:00.000Z" }),
    tenantSnapshot: async () => ({ tenant: { id: temple.id, slug: temple.slug, nameTh: temple.nameTh, status: "active" }, counts: { donors: 0, donations: 0, receipts: 0, ledgerEntries: 0 }, donationTotalSatang: "0", recentReceipts: [] }),
    listAuditLogs: async () => [
      { id: "al1", action: "application.approved", entityType: "application", entityId: pendingApp.id, actorEmail: "super@innovera.example", metadata: { reason: "ผ่านเกณฑ์" }, createdAt: "2026-06-03T00:00:00.000Z" },
    ],
    listDevotees: async () => [
      { id: "dev1", email: "devotee@example.com", displayName: "ญาติโยมเดโม", isActive: true, emailVerifiedAt: null, createdAt: "2026-06-01T00:00:00.000Z" },
    ],
    enableDevotee: async () => ({ id: "dev1", email: "devotee@example.com", displayName: "ญาติโยมเดโม", isActive: true, emailVerifiedAt: null, createdAt: "2026-06-01T00:00:00.000Z" }),
    disableDevotee: async () => ({ id: "dev1", email: "devotee@example.com", displayName: "ญาติโยมเดโม", isActive: false, emailVerifiedAt: null, createdAt: "2026-06-01T00:00:00.000Z" }),
    ...overrides,
  };
}

function flush(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function setInput(el: Element | null, value: string): void {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("platform-auth logic", () => {
  it("validates the login form", () => {
    expect(hasPlatformLoginErrors(validatePlatformLoginForm({ email: "super@x.com", password: "secret" }))).toBe(false);
    expect(hasPlatformLoginErrors(validatePlatformLoginForm({ email: "", password: "" }))).toBe(true);
    expect(validatePlatformLoginForm({ email: "bad", password: "x" }).email).toBeTruthy();
  });
});

describe("platform console (mounted)", () => {
  let container: HTMLDivElement;
  let root: Root;
  const props = (over: Partial<{ canWrite: boolean }> = {}) => ({ api: makeApi(), token: "t", canWrite: true, onUnauthorized: () => undefined, ...over });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shell renders the grouped nav (งานอนุมัติ/จัดการ/เครื่องมือ) and routes clicks + logout", async () => {
    let navTo = "";
    let loggedOut = false;
    await act(async () => {
      root.render(
        <PlatformShell userName="super@innovera.example" roleLabel="ผู้ดูแลระบบสูงสุด" page="applications" onNavigate={(id) => (navTo = id)} onLogout={() => (loggedOut = true)}>
          <div>เนื้อหา</div>
        </PlatformShell>,
      );
    });
    expect(container.querySelector(".app .sidebar")).toBeTruthy();
    expect(container.textContent).toContain("Innovera");
    expect(container.textContent).toContain("ใบสมัครวัด");
    expect(container.textContent).toContain("จัดการวัด");
    expect(container.textContent).toContain("เข้าถึงข้อมูลวัด");
    expect(container.textContent).toContain("ผู้ดูแลระบบสูงสุด");

    const templesBtn = Array.from(container.querySelectorAll(".sb-item")).find((b) => b.textContent?.includes("จัดการวัด"));
    await act(async () => templesBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(navTo).toBe("temples");

    const logoutBtn = Array.from(container.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "ออกจากระบบ");
    await act(async () => logoutBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(loggedOut).toBe(true);
  });

  it("login view submits credentials and authenticates", async () => {
    let authed = false;
    const api = makeApi();
    await act(async () => {
      root.render(<PlatformLoginView api={api} onAuthenticated={() => (authed = true)} />);
    });
    setInput(container.querySelector("#platform-login-email"), "super@innovera.example");
    setInput(container.querySelector("#platform-login-password"), "Password123!");
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(authed).toBe(true);
  });

  it("all-users view merges the 3 account types and disables a devotee", async () => {
    let disabledId = "";
    const api = makeApi({ disableDevotee: async (_t, id) => { disabledId = id; return { id, email: "devotee@example.com", displayName: "ญาติโยมเดโม", isActive: false, emailVerifiedAt: null, createdAt: "2026-06-01T00:00:00.000Z" }; } });
    await act(async () => {
      root.render(<PlatformAllUsersView api={api} token="t" canWrite onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("ผู้ใช้ทั้งหมด");
    expect(container.textContent).toContain("support@innovera.example"); // platform user (fixture)
    expect(container.textContent).toContain("devotee@example.com"); // devotee
    expect(container.textContent).toContain("ญาติโยม"); // type label

    // the devotee row has a working toggle (platform-owned account)
    const devRow = Array.from(container.querySelectorAll("tr")).find((tr) => tr.textContent?.includes("devotee@example.com"));
    const disableBtn = devRow ? Array.from(devRow.querySelectorAll("button")).find((b) => b.textContent === "ปิดใช้งาน") : undefined;
    expect(disableBtn).toBeTruthy();
    await act(async () => disableBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    expect(disabledId).toBe("dev1");
  });

  it("audit view lists the platform action history (actor + Thai action label + detail)", async () => {
    await act(async () => {
      root.render(<PlatformAuditView api={makeApi()} token="t" canWrite onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("ประวัติการใช้งาน");
    expect(container.textContent).toContain("อนุมัติใบสมัครวัด"); // Thai label for application.approved
    expect(container.textContent).toContain("super@innovera.example"); // actor
    expect(container.textContent).toContain("ผ่านเกณฑ์"); // reason from metadata
  });

  it("dashboard shows KPIs + the pending-application queue and links to applications", async () => {
    let navTo = "";
    await act(async () => {
      root.render(<PlatformDashboard api={makeApi()} token="t" canWrite onUnauthorized={() => undefined} onGoto={(p) => (navTo = p)} />);
    });
    await flush();
    expect(container.textContent).toContain("แดชบอร์ดแพลตฟอร์ม");
    expect(container.textContent).toContain("วัดทั้งหมด");
    expect(container.textContent).toContain("ใบสมัครรอตรวจสอบ");
    expect(container.textContent).toContain("สัดส่วนสถานะวัด");
    expect(container.textContent).toContain("วัดขอสมัครเดโม"); // pending application in the queue
    const seeAll = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "ดูทั้งหมด");
    await act(async () => seeAll?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(navTo).toBe("applications");
  });

  it("applications view lists a pending application and approving calls approveApplication with slug+password", async () => {
    let approvedWith: { slug: string; adminPassword: string } | null = null;
    const api = makeApi({
      approveApplication: async (_t, _id, input) => {
        approvedWith = { slug: input.slug, adminPassword: input.adminPassword };
        return approveResult;
      },
    });
    await act(async () => {
      root.render(<ApplicationsView api={api} token="t" canWrite onUnauthorized={() => undefined} />);
    });
    await flush();
    expect(container.textContent).toContain("วัดขอสมัครเดโม");
    expect(container.textContent).toContain("apply@example.com");

    const approveBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "อนุมัติ");
    await act(async () => approveBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    // slug auto-suggested (wat-apply) + adminEmail prefilled; fill the admin password.
    setInput(container.querySelector('.modal input[type="password"]'), "Password123!");
    const confirm = Array.from(container.querySelectorAll(".modal button")).find((b) => b.textContent?.includes("อนุมัติและสร้างวัด"));
    await act(async () => confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    expect(approvedWith).toEqual({ slug: "wat-apply", adminPassword: "Password123!" });
    expect(container.textContent).toContain("สร้างวัด");
  });

  it("applications view rejecting calls rejectApplication with a reason", async () => {
    let rejectedReason = "";
    const api = makeApi({
      rejectApplication: async (_t, _id, reason) => {
        rejectedReason = reason;
        return { ...pendingApp, status: "rejected" };
      },
    });
    await act(async () => {
      root.render(<ApplicationsView api={api} token="t" canWrite onUnauthorized={() => undefined} />);
    });
    await flush();
    const rejectBtn = Array.from(container.querySelectorAll("tbody button")).find((b) => b.textContent === "ปฏิเสธ");
    await act(async () => rejectBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    setInput(container.querySelector(".modal input"), "ข้อมูลไม่ครบ");
    const confirm = Array.from(container.querySelectorAll(".modal button")).find((b) => b.textContent?.includes("ยืนยันปฏิเสธ"));
    await act(async () => confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    expect(rejectedReason).toBe("ข้อมูลไม่ครบ");
  });

  it("hides approve/reject for read-only support (canWrite=false)", async () => {
    await act(async () => {
      root.render(<ApplicationsView {...props({ canWrite: false })} />);
    });
    await flush();
    expect(container.textContent).toContain("วัดขอสมัครเดโม");
    expect(Array.from(container.querySelectorAll("tbody button")).some((b) => b.textContent === "อนุมัติ")).toBe(false);
    expect(Array.from(container.querySelectorAll("tbody button")).some((b) => b.textContent === "ปฏิเสธ")).toBe(false);
  });

  it("temples view suspends an active temple with a reason", async () => {
    let suspendedReason = "";
    const api = makeApi({
      suspendTemple: async (_t, _id, reason) => {
        suspendedReason = reason;
        return { ...temple, status: "suspended" };
      },
    });
    await act(async () => {
      root.render(<TemplesView api={api} token="t" canWrite onUnauthorized={() => undefined} />);
    });
    await flush();
    const suspendBtn = Array.from(container.querySelectorAll("tbody button")).find((b) => b.textContent === "ระงับ");
    await act(async () => suspendBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    setInput(container.querySelector(".modal input"), "ผิดเงื่อนไข");
    const confirm = Array.from(container.querySelectorAll(".modal button")).find((b) => b.textContent?.includes("ยืนยันระงับ"));
    await act(async () => confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    expect(suspendedReason).toBe("ผิดเงื่อนไข");
  });

  it("platform-users view disables an active user", async () => {
    let disabledId = "";
    const api = makeApi({
      disablePlatformUser: async (_t, id) => {
        disabledId = id;
        return { ...platformUser, isActive: false };
      },
    });
    await act(async () => {
      root.render(<PlatformUsersView api={api} token="t" canWrite onUnauthorized={() => undefined} />);
    });
    await flush();
    const disableBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "ปิดใช้งาน");
    await act(async () => disableBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    expect(disabledId).toBe(platformUser.id);
  });
});
