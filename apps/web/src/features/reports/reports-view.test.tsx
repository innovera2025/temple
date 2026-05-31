import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReportsApi, ReportView } from "./reports";
import { ReportControls, ReportsPage, ReportTable } from "./reports-view";

const report: ReportView = {
  type: "donations",
  columns: ["วันที่บริจาค", "ผู้บริจาค", "จำนวนเงิน (บาท)"],
  rows: [["2026-05-20", "คุณสมชาย", "123.45"]],
  count: 1,
  csv: "วันที่บริจาค,ผู้บริจาค,จำนวนเงิน (บาท)\r\n2026-05-20,คุณสมชาย,123.45",
};

describe("reports view", () => {
  it("controls render report-type options, date fields, and a generate button", () => {
    const html = renderToStaticMarkup(
      <ReportControls
        type="donations"
        filters={{}}
        submitting={false}
        onTypeChange={() => undefined}
        onFiltersChange={() => undefined}
        onGenerate={() => undefined}
      />,
    );
    expect(html).toContain("รายงานการบริจาค");
    expect(html).toContain("รายงานบัญชีรับ-จ่าย");
    expect(html).toContain("ตั้งแต่วันที่");
    expect(html).toContain("สร้างรายงาน");
  });

  it("table renders the columns and row cells", () => {
    const html = renderToStaticMarkup(<ReportTable report={report} />);
    expect(html).toContain("วันที่บริจาค");
    expect(html).toContain("คุณสมชาย");
    expect(html).toContain("123.45");
  });

  it("table shows a Thai empty state when there are no rows", () => {
    const html = renderToStaticMarkup(<ReportTable report={{ ...report, rows: [], count: 0 }} />);
    expect(html).toContain("ไม่พบข้อมูลในช่วงที่เลือก");
  });

  it("page shell renders the heading and controls before a report is generated", () => {
    const api: ReportsApi = { get: async () => report };
    const html = renderToStaticMarkup(<ReportsPage api={api} today="2026-05-31" />);
    expect(html).toContain("รายงานและส่งออก");
    expect(html).toContain("สร้างรายงาน");
  });
});
