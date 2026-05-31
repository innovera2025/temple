import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./app";
import { SmokeShell } from "./smoke/SmokeShell";

describe("App (default temple product)", () => {
  it("renders the temple login screen as the default route", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("ระบบจัดการวัด");
    expect(html).toContain("เข้าสู่ระบบ");
    expect(html).toContain("Temple Management System");
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
});

describe("SmokeShell (dev-only, separated from the product)", () => {
  it("still renders the backend smoke-test tools when used directly", () => {
    const html = renderToStaticMarkup(<SmokeShell />);

    expect(html).toContain("เมนูระบบวัด");
    expect(html).toContain("API response preview");
    expect(html).toContain("Backend smoke test");
  });
});
