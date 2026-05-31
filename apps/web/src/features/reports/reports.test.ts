import { describe, expect, it, vi } from "vitest";
import { buildReportQuery, createReportsApiClient, reportFilename, reportTypeLabel } from "./reports";

describe("reports helpers", () => {
  it("builds query strings, filenames, and Thai labels", () => {
    expect(buildReportQuery({})).toBe("");
    expect(buildReportQuery({ dateFrom: "2026-05-01", status: "confirmed" })).toBe(
      "?dateFrom=2026-05-01&status=confirmed",
    );
    expect(reportFilename("donations", "2026-05-31")).toBe("report-donations-2026-05-31.csv");
    expect(reportTypeLabel("ledger")).toBe("รายงานบัญชีรับ-จ่าย");
  });
});

describe("reports API client", () => {
  it("GETs /reports/:type with the token and filters, and parses the report", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ report: { type: "donations", columns: ["a"], rows: [["x"]], count: 1, csv: "a\r\nx" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const api = createReportsApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const report = await api.get("donations", { dateFrom: "2026-05-01" });
    expect(report.count).toBe(1);
    expect(fetchFn.mock.calls[0]?.[0]).toContain("/reports/donations?dateFrom=2026-05-01");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("surfaces the API's Thai error message on failure", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "ไม่ได้รับอนุญาต" } }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createReportsApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(api.get("ledger")).rejects.toThrow("ไม่ได้รับอนุญาต");
  });
});
