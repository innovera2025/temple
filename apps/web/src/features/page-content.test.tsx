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
      ["donors", ["ทะเบียนผู้บริจาค", "ค้นหาชื่อ เบอร์โทร หรืออีเมล", "ผู้บริจาคทั้งหมด"]],
      ["receipt", ["ใบอนุโมทนาบัตร", "ขออนุโมทนาบุญแด่", "ใบที่ออกล่าสุด"]],
      ["ledger", ["บัญชีรายรับ-รายจ่าย", "รายรับรวม", "กระทบยอด"]],
      ["events", ["กิจกรรมและพิธี", "จองกิจกรรม", "มิถุนายน ๒๕๖๙"]],
      ["people", ["พระสงฆ์และเจ้าหน้าที่", "พระ-เณร", "เพิ่มบุคลากร"]],
      ["reports", ["รายงานและส่งออกข้อมูล", "ตั้งค่ารายงาน", "PDF"]],
      ["roles", ["สิทธิ์ผู้ใช้งาน", "บัญชีผู้ใช้งาน", "บทบาทและสิทธิ์"]],
      ["audit", ["บันทึกการใช้งาน", "ข้อมูลนี้ลบไม่ได้", "กำลังโหลด…"]],
      ["designsystem", ["ระบบออกแบบ", "btn btn-primary"]],
    ];
    for (const [page, texts] of expectations) {
      const html = render(page);
      for (const text of texts) expect(html).toContain(text);
    }
  });

  it("locks the design-faithful details ported from the source .jsx", () => {
    // dashboard: chart legend/unit + clickable task list with task labels
    const dash = render("dashboard");
    expect(dash).toContain("หน่วย: พันบาท");
    expect(dash).toContain("รอออกใบอนุโมทนาบัตร");
    // ledger: searchable toolbar + the design's status chips + footer
    const ledger = render("ledger");
    expect(ledger).toContain("ค้นหารายการ / เอกสารอ้างอิง");
    expect(ledger).toContain("บันทึกแล้ว");
    expect(ledger).toContain("ยอดสุทธิที่แสดง");
    // reports: CSV format option + per-report description + audit-log note
    const reports = render("reports");
    expect(reports).toContain("CSV");
    expect(reports).toContain("สรุปการบริจาคแยกตามกองทุน ช่องทาง และช่วงเวลา");
    expect(reports).toContain("การสร้างรายงานจะถูกบันทึกในบันทึกการใช้งาน");
    // people: search box + dynamic count tabs
    const people = render("people");
    expect(people).toContain("ค้นหาฉายา ชื่อ หรือตำแหน่ง");
    expect(people).toContain("พระ-เณร");
    // audit: tax/lock footer line with the immutability note
    const audit = render("audit");
    expect(audit).toContain("บันทึกนี้ไม่สามารถแก้ไขหรือลบได้");
    // receipt: tax-deduction info box; the document header renders the REAL
    // tenant profile now (no hardcoded demo temple name/phone).
    const receipt = render("receipt");
    expect(receipt).toContain("ลดหย่อนภาษีได้");
    expect(receipt).not.toContain("วัดธรรมสถิตวนาราม");
    expect(receipt).not.toContain("โทร. ๐๕๓-๑๒๓-๔๕๖๗");
  });

  it("hides the donor create action for a role without donor write access (staff)", () => {
    // staff has no donor permission -> canWrite false -> "เพิ่มผู้บริจาค" hidden.
    const staff = render("donors", "staff");
    const admin = render("donors", "admin");
    expect(admin).toContain("เพิ่มผู้บริจาค");
    expect(staff).not.toContain("เพิ่มผู้บริจาค");
  });
});
