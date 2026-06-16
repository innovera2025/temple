import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./app";
import { SmokeShell } from "./smoke/SmokeShell";

afterEach(() => {
  window.localStorage.clear();
  window.location.hash = "";
});

describe("App (default temple product)", () => {
  it("renders the design-backed temple login screen as the default route", () => {
    const html = renderToStaticMarkup(<App />);

    // Design-backed brand + Thai copy (admin-app.jsx LoginScreen). Pre-login
    // branding is the generic product name — the tenant is unknown until login.
    expect(html).toContain("ระบบจัดการวัด");
    expect(html).toContain("ยินดีต้อนรับกลับ");
    expect(html).toContain("เข้าสู่ระบบ");
    expect(html).not.toContain("วัดธรรมสถิตวนาราม");
  });

  it("is the temple product, not the Agent Control Tower", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).not.toContain("Agent Control Tower");
    expect(html).not.toContain("ห้องควบคุม");
    expect(html).not.toContain("orchestrator");
  });

  it("does not show the dev smoke shell by default", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).not.toContain("เมนูระบบวัด");
    expect(html).not.toContain("API response preview");
    expect(html).not.toContain("Run quick smoke");
  });

  it("renders the RoleShell product (not the login screen) once a session exists", () => {
    window.localStorage.setItem(
      "wat-session",
      JSON.stringify({
        accessToken: "tok",
        user: {
          email: "admin@wat-arun.example",
          displayName: "ผู้ดูแลวัดอรุณ",
          role: "admin",
          tenantId: "wat-arun",
        },
      }),
    );

    const html = renderToStaticMarkup(<App />);

    // RoleShell chrome (a NAV group label exists only in the shell sidebar).
    expect(html).toContain("การเงินและบริจาค");
    expect(html).toContain("ผู้ดูแลวัดอรุณ");
    // The login welcome is gone — we transitioned to the product shell.
    expect(html).not.toContain("ยินดีต้อนรับกลับ");
  });
});

describe("SmokeShell (dev-only, separated from the product)", () => {
  it("still renders the backend smoke-test tools when used directly", () => {
    const html = renderToStaticMarkup(<SmokeShell />);

    expect(html).toContain("เมนูระบบวัด");
    expect(html).toContain("API response preview");
    expect(html).toContain("Backend smoke test");
  });

  it("gates #/smoke to the platform owner: shows the smoke tool only with a platform session", () => {
    window.location.hash = "#/smoke";

    // No platform session -> the smoke tool is NOT served; the platform console
    // (login) is shown instead, never the staff product login.
    const gated = renderToStaticMarkup(<App />);
    expect(gated).not.toContain("เมนูระบบวัด");
    expect(gated).not.toContain("ยินดีต้อนรับกลับ");

    // With a platform-owner session, the smoke tool renders.
    window.localStorage.setItem(
      "wat-platform-session",
      JSON.stringify({
        accessToken: "x",
        platform: { id: "1", email: "super@innovera.example", platformRole: "super_admin" },
      }),
    );
    const smoke = renderToStaticMarkup(<App />);
    expect(smoke).toContain("เมนูระบบวัด");

    window.localStorage.clear();
    window.location.hash = "";
    const def = renderToStaticMarkup(<App />);
    expect(def).toContain("ยินดีต้อนรับกลับ");
    expect(def).not.toContain("เมนูระบบวัด");
  });
});
