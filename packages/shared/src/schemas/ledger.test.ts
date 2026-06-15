import { describe, expect, it } from "vitest";
import { ictDateIso, ictMonth, monthRange } from "./ledger";

describe("ICT civil-date helpers (UTC+7)", () => {
  it("ictDateIso rolls into the next day once it is past 17:00 UTC (= 00:00 ICT)", () => {
    // 2026-06-14 23:30 UTC is already 2026-06-15 06:30 in Thailand.
    expect(ictDateIso(new Date("2026-06-14T23:30:00.000Z"))).toBe("2026-06-15");
    // 2026-06-14 16:59 UTC is still 2026-06-14 in Thailand (23:59 ICT).
    expect(ictDateIso(new Date("2026-06-14T16:59:00.000Z"))).toBe("2026-06-14");
  });

  it("ictMonth uses the Thai civil month at a month boundary", () => {
    // Last day of June, late UTC, has already become 1 July in Thailand.
    expect(ictMonth(new Date("2026-06-30T18:00:00.000Z"))).toBe("2026-07");
    // Early on 1 July UTC is still June in Thailand (until 17:00 UTC on 30 June).
    expect(ictMonth(new Date("2026-06-30T16:00:00.000Z"))).toBe("2026-06");
  });

  it("a default ICT-month range stays a valid full-month range", () => {
    const range = monthRange(ictMonth(new Date("2026-06-30T18:00:00.000Z")));
    expect(range).toEqual({ dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  });
});
