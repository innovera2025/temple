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

  it("renders the audit log design-backed page", () => {
    const html = render("audit");
    expect(html).toContain('data-page="audit"');
    expect(html).toContain("บันทึกการใช้งาน");
    expect(html).toContain("ข้อมูลนี้ลบไม่ได้");
  });

  it("renders the temple-admin design-backed dashboard instead of the old smoke-style metric shell", () => {
    const html = render("dashboard");
    expect(html).toContain("รายรับ-รายจ่าย ๖ เดือนล่าสุด");
    expect(html).toContain("งานที่ต้องดำเนินการ");
    expect(html).toContain("ความคืบหน้ากองทุน");
  });

  it("renders design-backed pages for the remaining temple-admin screens", () => {
    const expectations: Array<[PageId, string[]]> = [
      ["donations", ["บันทึกการบริจาค", "ข้อมูลผู้บริจาค", "สรุปรายการ"]],
      ["donors", ["ทะเบียนผู้บริจาค", "ผู้บริจาค VIP", "ประวัติการบริจาค"]],
      ["receipt", ["ใบอนุโมทนาบัตร", "ขออนุโมทนาบุญแด่", "ใบที่ออกล่าสุด"]],
      ["ledger", ["บัญชีรายรับ-รายจ่าย", "รายรับรวม", "กระทบยอด"]],
      ["events", ["กิจกรรมและพิธี", "จองกิจกรรม", "มิถุนายน ๒๕๖๙"]],
      ["people", ["พระสงฆ์และเจ้าหน้าที่", "พระ-เณร", "เพิ่มบุคลากร"]],
      ["reports", ["รายงานและส่งออกข้อมูล", "ตั้งค่ารายงาน", "PDF"]],
      ["roles", ["สิทธิ์ผู้ใช้งาน", "บัญชีผู้ใช้งาน", "บทบาทและสิทธิ์"]],
      ["audit", ["บันทึกการใช้งาน", "ข้อมูลนี้ลบไม่ได้", "ส่งออกบันทึก"]],
      ["designsystem", ["ระบบออกแบบ", "btn btn-primary"]],
    ];
    for (const [page, texts] of expectations) {
      const html = render(page);
      for (const text of texts) expect(html).toContain(text);
    }
  });

  it("hides the donor create form for a role without donor write access (staff)", () => {
    // staff has no donor permission -> canWrite false -> no create button.
    const staff = render("donors", "staff");
    const admin = render("donors", "admin");
    expect(admin).toContain("เพิ่มผู้บริจาค");
    expect(staff).not.toContain("เพิ่มผู้บริจาค");
  });
});
