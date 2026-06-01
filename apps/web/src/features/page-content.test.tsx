import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageContent } from "./page-content";
import type { PageId } from "../layout/nav";

function render(page: PageId, role: "admin" | "finance" | "staff" = "admin"): string {
  return renderToStaticMarkup(
    <PageContent page={page} baseUrl="http://api" getToken={() => "tok"} role={role} today="2026-06-01" />,
  );
}

describe("PageContent — page → view routing", () => {
  it("wraps each page in a data-page marker and selects the matching view", () => {
    // Every wired page id renders without throwing and is tagged with data-page.
    const pages: PageId[] = [
      "dashboard",
      "donations",
      "donors",
      "receipt",
      "ledger",
      "events",
      "people",
      "reports",
      "roles",
      "temple",
      "inventory",
    ];
    for (const page of pages) {
      const html = render(page);
      expect(html).toContain(`data-page="${page}"`);
    }
  });

  it("renders the new donors view for the donors page", () => {
    const html = render("donors");
    expect(html).toContain('data-page="donors"');
    expect(html).toContain("ทะเบียนผู้บริจาค");
  });

  it("shows an honest unavailable state for audit (no API yet)", () => {
    const html = render("audit");
    expect(html).toContain('data-page="audit"');
    expect(html).toContain("ยังไม่พร้อมใช้งาน");
  });

  it("shows the design-system showcase for designsystem", () => {
    const html = render("designsystem");
    expect(html).toContain("ระบบออกแบบ");
    expect(html).toContain("btn btn-primary");
  });

  it("hides the donor create form for a role without donor write access (staff)", () => {
    // staff has no donor permission -> canWrite false -> no create button.
    const staff = render("donors", "staff");
    const admin = render("donors", "admin");
    expect(admin).toContain("เพิ่มผู้บริจาค");
    expect(staff).not.toContain("เพิ่มผู้บริจาค");
  });
});
